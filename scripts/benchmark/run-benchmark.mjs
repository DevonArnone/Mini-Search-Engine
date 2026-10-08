#!/usr/bin/env node
// Search benchmark against the production build.
//
// For each corpus size it exports a deterministic sample of the crawled
// documents into its own index directory, then runs several trials. Every
// trial starts a fresh `next start` server, times the cold start, warms up,
// and measures the fixed query set at each concurrency level.
//
//   node scripts/benchmark/run-benchmark.mjs
//   node scripts/benchmark/run-benchmark.mjs --sizes 1000,5000 --trials 1 --out /tmp/bench
//
// Run `npm run build` first. PostgreSQL must be reachable: corpora are
// exported from it and analytics writes stay enabled, as in production.

import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "package.json"));

function parseArgs() {
  const args = {
    sizes: [1000, 5000, 10001, 20000],
    trials: 3,
    warmup: 100,
    requests: 500,
    concurrency: [1, 10],
    port: 3100,
    out: path.join(root, "docs", "evidence", "benchmarks"),
    python: path.join(root, ".venv", "bin", "python"),
    databaseUrl: process.env.DATABASE_URL ?? "postgresql://mini_search:mini_search@localhost:5432/mini_search",
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    const value = argv[i + 1];
    if (!(key in args) || value === undefined) throw new Error(`unknown or incomplete option: ${argv[i]}`);
    if (key === "sizes" || key === "concurrency") args[key] = value.split(",").map(Number);
    else if (typeof args[key] === "number") args[key] = Number(value);
    else args[key] = value;
  }
  return args;
}

const args = parseArgs();
// Analytics rows written by the benchmark carry this session and are removed afterwards.
const BENCH_SESSION = "be7c4a11-0000-4000-8000-000000000001";
const queries = JSON.parse(readFileSync(path.join(root, "scripts/benchmark/queries.json"), "utf8")).queries;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value, digits = 2) => Number(value.toFixed(digits));

function toUrl(base, params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) search.append(key, String(item));
    else search.set(key, String(value));
  }
  if (!search.has("limit")) search.set("limit", "10");
  return `${base}/api/search?${search}`;
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
  return {
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length, 3),
    p50: round(at(0.5), 3),
    p95: round(at(0.95), 3),
    max: round(sorted[sorted.length - 1], 3),
  };
}

async function request(base, query) {
  const startedAt = performance.now();
  try {
    const response = await fetch(toUrl(base, query.params), { headers: { cookie: `devdocs_session=${BENCH_SESSION}` } });
    const body = await response.json();
    const httpMs = performance.now() - startedAt;
    if (!response.ok || typeof body.processingTimeMs !== "number") return { ok: false, httpMs, category: query.category };
    return { ok: true, httpMs, engineMs: body.processingTimeMs, category: query.category };
  } catch {
    return { ok: false, httpMs: performance.now() - startedAt, category: query.category };
  }
}

// Sends `total` requests, keeping exactly `concurrency` in flight.
async function load(base, total, concurrency, offset = 0) {
  const results = new Array(total);
  let next = 0;
  const startedAt = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (;;) {
        const index = next++;
        if (index >= total) return;
        results[index] = await request(base, queries[(offset + index) % queries.length]);
      }
    }),
  );
  return { results, wallMs: performance.now() - startedAt };
}

function measure({ results, wallMs }) {
  const ok = results.filter((result) => result.ok);
  const byCategory = {};
  for (const result of ok) (byCategory[result.category] ??= []).push(result.httpMs);
  return {
    requests: results.length,
    errors: results.length - ok.length,
    httpMs: summarize(ok.map((result) => result.httpMs)),
    engineMs: summarize(ok.map((result) => result.engineMs)),
    throughputRps: round(results.length / (wallMs / 1000), 1),
    httpMeanMsByCategory: Object.fromEntries(Object.entries(byCategory).map(([category, values]) => [category, round(values.reduce((a, b) => a + b, 0) / values.length, 3)])),
  };
}

function processRssBytes(pid) {
  try {
    return Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim()) * 1024;
  } catch {
    return null;
  }
}

async function startServer(indexDir) {
  const nextBin = require.resolve("next/dist/bin/next");
  const startedAt = performance.now();
  const child = spawn(process.execPath, [nextBin, "start", "--port", String(args.port)], {
    cwd: path.join(root, "apps/web"),
    env: { ...process.env, NODE_ENV: "production", SEARCH_BACKEND: "native", SEARCH_INDEX_DIR: indexDir, DATABASE_URL: args.databaseUrl, SEARCH_DEMO_MODE: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const base = `http://127.0.0.1:${args.port}`;

  const deadline = Date.now() + 180_000;
  let status = null;
  let firstResponseMs = null;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${output}`);
    if (Date.now() > deadline) {
      child.kill("SIGKILL");
      throw new Error(`server did not become ready:\n${output}`);
    }
    try {
      const response = await fetch(`${base}/api/status`);
      firstResponseMs ??= performance.now() - startedAt;
      status = await response.json();
      if (status.searchEngine?.state === "ready") break;
      if (status.searchEngine?.state === "error" || status.searchEngine?.state === "missing") {
        throw new Error(`index is ${status.searchEngine.state}: ${status.searchEngine.diagnostics?.lastError}`);
      }
    } catch (error) {
      if (String(error.message).startsWith("index is")) {
        child.kill("SIGKILL");
        throw error;
      }
    }
    await sleep(25);
  }
  return {
    child,
    base,
    cold: {
      // Process spawn until the HTTP server first answers.
      serverFirstResponseMs: round(firstResponseMs, 1),
      // Process spawn until the index is hydrated and searchable.
      searchableMs: round(performance.now() - startedAt, 1),
      // Time the engine worker spent reading and indexing every batch.
      engineHydrationMs: status.searchEngine.diagnostics.hydrationMs,
    },
    status,
  };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await sleep(300);
}

function buildCorpus(size) {
  const indexDir = path.join(root, "data", "bench", String(size));
  const output = execFileSync(args.python, [path.join(root, "services/crawler/scripts/rebuild_index.py"), "--limit", String(size), "--out", indexDir], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: args.databaseUrl, SEED_CONFIG_PATH: path.join(root, "services/crawler/seeds/docs_sources.yaml") },
  });
  return { indexDir, ...JSON.parse(output) };
}

async function removeBenchmarkAnalytics() {
  const { Client } = require("pg");
  const client = new Client({ connectionString: args.databaseUrl });
  await client.connect();
  try {
    // Search events are written after the response; let the last ones land.
    await sleep(1500);
    const result = await client.query("DELETE FROM search_analytics WHERE session_id = $1", [BENCH_SESSION]);
    return result.rowCount;
  } finally {
    await client.end();
  }
}

function git(...parameters) {
  try {
    return execFileSync("git", parameters, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function environment() {
  return {
    recordedAt: new Date().toISOString(),
    commit: git("rev-parse", "--short", "HEAD"),
    workingTreeDirty: Boolean(git("status", "--porcelain")),
    hardware: { cpu: os.cpus()[0]?.model, logicalCores: os.cpus().length, memoryGb: round(os.totalmem() / 2 ** 30, 1) },
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    versions: {
      node: process.version,
      next: require("next/package.json").version,
      react: require("react/package.json").version,
      postgres: "16 (Docker, localhost)",
    },
    build: existsSync(path.join(root, "apps/web/.next/BUILD_ID")) ? readFileSync(path.join(root, "apps/web/.next/BUILD_ID"), "utf8").trim() : null,
  };
}

function evaluate(sizes) {
  const meansAt = (size, concurrency) => sizes.find((entry) => entry.size === size)?.trials?.map((trial) => trial.load.find((run) => run.concurrency === concurrency)?.httpMs.mean);
  const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const tenK = meansAt(10001, 1);
  const fiveK = meansAt(5000, 1);
  const acceptance = {};
  acceptance.thirtyMs = tenK?.every((value) => typeof value === "number")
    ? {
        rule: "full HTTP mean latency <= 30 ms in every warmed 10,001-document trial at concurrency 1",
        trialMeansMs: tenK,
        accepted: tenK.every((value) => value <= 30),
      }
    : { rule: "full HTTP mean latency <= 30 ms in every warmed 10,001-document trial at concurrency 1", accepted: null, reason: "no 10,001-document trials were run" };
  acceptance.flatAtScale =
    tenK?.every((value) => typeof value === "number") && fiveK?.every((value) => typeof value === "number")
      ? {
          rule: "10,001-document mean no more than 25% above the 5,000-document mean (concurrency 1, mean of trial means)",
          mean5kMs: round(average(fiveK), 3),
          mean10kMs: round(average(tenK), 3),
          changePercent: round((average(tenK) / average(fiveK) - 1) * 100, 1),
          accepted: average(tenK) <= average(fiveK) * 1.25,
        }
      : { rule: "10,001-document mean no more than 25% above the 5,000-document mean", accepted: null, reason: "both corpus sizes are required" };
  return acceptance;
}

function report(result) {
  const lines = [];
  const { environment: env, parameters } = result;
  lines.push("# Search benchmark", "");
  lines.push(`Recorded ${env.recordedAt} at commit \`${env.commit}\`${env.workingTreeDirty ? " (uncommitted changes present)" : ""}, production build \`${env.build}\`.`, "");
  lines.push("## Conditions", "");
  lines.push(`- Hardware: ${env.hardware.cpu}, ${env.hardware.logicalCores} logical cores, ${env.hardware.memoryGb} GB RAM. Client and server on the same machine.`);
  lines.push(`- Software: ${env.os}; Node ${env.versions.node}; Next.js ${env.versions.next}; React ${env.versions.react}; PostgreSQL ${env.versions.postgres}.`);
  lines.push("- Server: `next start` (production build), native backend, one engine worker. Analytics writes enabled and deferred until after the response.");
  lines.push(`- Each trial: fresh server process, ${parameters.warmup} warm-up requests, then ${parameters.requests} measured requests per concurrency level (${parameters.concurrency.join(" and ")}).`);
  lines.push(`- Query set: ${parameters.queryCount} fixed queries (${Object.entries(parameters.queryCategories).map(([category, count]) => `${count} ${category}`).join(", ")}), defined in \`scripts/benchmark/queries.json\`.`);
  lines.push("- Corpora: deterministic nested samples of the real crawled documents, exported from PostgreSQL. No synthetic documents.");
  lines.push("- HTTP time is measured by the client around the whole request, including reading and parsing the JSON body. Engine time is the search engine's own execution time as reported in the response.", "");

  lines.push("## Warm query latency", "");
  lines.push("| Documents | Trial | Concurrency | HTTP mean (ms) | HTTP p50 | HTTP p95 | Engine mean (ms) | Engine p95 | Throughput (req/s) | Errors |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const size of result.sizes) {
    if (!size.trials) {
      lines.push(`| ${size.size.toLocaleString("en-US")} | — | — | not available: ${size.unavailable} | | | | | | |`);
      continue;
    }
    size.trials.forEach((trial, trialIndex) => {
      for (const run of trial.load) {
        lines.push(`| ${size.documents.toLocaleString("en-US")} | ${trialIndex + 1} | ${run.concurrency} | ${run.httpMs.mean} | ${run.httpMs.p50} | ${run.httpMs.p95} | ${run.engineMs.mean} | ${run.engineMs.p95} | ${run.throughputRps} | ${run.errors} |`);
      }
    });
  }

  lines.push("", "## Cold start and memory", "");
  lines.push("| Documents | Trial | Engine hydration (ms) | Spawn to searchable (ms) | Server RSS after load (MB) | Engine heap used (MB) | Engine off-heap (MB) | Index terms |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const size of result.sizes) {
    size.trials?.forEach((trial, trialIndex) => {
      const mb = (bytes) => (bytes === null ? "—" : round(bytes / 2 ** 20, 1));
      lines.push(`| ${size.documents.toLocaleString("en-US")} | ${trialIndex + 1} | ${trial.cold.engineHydrationMs} | ${trial.cold.searchableMs} | ${mb(trial.memory.serverRssBytes)} | ${mb(trial.memory.heapUsedBytes)} | ${mb(trial.memory.externalBytes)} | ${trial.memory.terms.toLocaleString("en-US")} |`);
    });
  }

  lines.push("", "## Acceptance", "");
  for (const [name, check] of Object.entries(result.acceptance)) {
    const verdict = check.accepted === null ? `NOT EVALUATED (${check.reason})` : check.accepted ? "ACCEPTED" : "REJECTED";
    lines.push(`- **${name}** — ${check.rule}: **${verdict}**${check.trialMeansMs ? `; trial means ${check.trialMeansMs.join(", ")} ms` : ""}${check.changePercent !== undefined ? `; 5K ${check.mean5kMs} ms, 10,001 ${check.mean10kMs} ms (${check.changePercent >= 0 ? "+" : ""}${check.changePercent}%)` : ""}.`);
  }
  lines.push("", "Concurrency-10 results are reported above and are not part of either acceptance rule.", "");
  return lines.join("\n");
}

async function main() {
  if (!existsSync(path.join(root, "apps/web/.next/BUILD_ID"))) throw new Error("no production build found; run `npm run build` first");
  mkdirSync(args.out, { recursive: true });

  const categories = {};
  for (const query of queries) categories[query.category] = (categories[query.category] ?? 0) + 1;
  const result = {
    environment: environment(),
    parameters: { trials: args.trials, warmup: args.warmup, requests: args.requests, concurrency: args.concurrency, queryCount: queries.length, queryCategories: categories },
    sizes: [],
  };

  for (const size of args.sizes) {
    const corpus = buildCorpus(size);
    if (corpus.documents < size) {
      console.log(`${size}: not available (corpus holds ${corpus.documents} documents)`);
      result.sizes.push({ size, unavailable: `the crawled corpus holds ${corpus.documents.toLocaleString("en-US")} documents` });
      continue;
    }
    const entry = { size, documents: corpus.documents, batches: corpus.batches, trials: [] };
    for (let trial = 1; trial <= args.trials; trial++) {
      const server = await startServer(corpus.indexDir);
      try {
        const loadRuns = [];
        for (const concurrency of args.concurrency) {
          await load(server.base, args.warmup, concurrency);
          loadRuns.push({ concurrency, ...measure(await load(server.base, args.requests, concurrency)) });
        }
        const status = await (await fetch(`${server.base}/api/status`)).json();
        const diagnostics = status.searchEngine.diagnostics;
        entry.trials.push({
          cold: server.cold,
          load: loadRuns,
          memory: { serverRssBytes: processRssBytes(server.child.pid), heapUsedBytes: diagnostics.heapUsedBytes, externalBytes: diagnostics.externalBytes, terms: diagnostics.terms },
          indexRevision: status.searchEngine.indexRevision,
        });
        const c1 = loadRuns.find((run) => run.concurrency === 1) ?? loadRuns[0];
        console.log(`${size} trial ${trial}: hydration ${server.cold.engineHydrationMs} ms; c=${c1.concurrency} http mean ${c1.httpMs.mean} ms p95 ${c1.httpMs.p95} ms; engine mean ${c1.engineMs.mean} ms; errors ${loadRuns.reduce((sum, run) => sum + run.errors, 0)}`);
      } finally {
        await stopServer(server.child);
      }
    }
    result.sizes.push(entry);
  }

  result.acceptance = evaluate(result.sizes);
  result.removedAnalyticsRows = await removeBenchmarkAnalytics();
  writeFileSync(path.join(args.out, "benchmark.json"), JSON.stringify(result, null, 2) + "\n");
  writeFileSync(path.join(args.out, "benchmark.md"), report(result));
  console.log(`\nWrote ${path.relative(root, path.join(args.out, "benchmark.md"))}`);
  console.log(JSON.stringify(result.acceptance, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
