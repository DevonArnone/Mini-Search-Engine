#!/usr/bin/env node
// Measures what index hydration costs and where the time goes, then compares
// three ways of paying for it:
//
//   cold        hydrate the whole index before answering (what any process
//               without a loaded index must do)
//   persistent  hydrate once, keep the index in memory, answer from it
//   incremental apply one newly published 250-document batch to a loaded index
//
// This is a controlled comparison run on one machine. It describes the cost
// of the cold path as measured here, not an incident observed in production.
//
//   node scripts/benchmark/profile-hydration.mjs --index data/bench/10001

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const dist = path.join(root, "packages/search-engine/dist");
const { Engine } = require(path.join(dist, "engine.js"));
const { IndexWriter, readBatch, readManifest } = require(path.join(dist, "store.js"));

const argv = process.argv.slice(2);
const option = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const indexDir = path.resolve(root, option("index", "data/bench/10001"));
const outDir = path.resolve(root, option("out", "docs/evidence/benchmarks"));
const coldRuns = Number(option("cold-runs", "5"));
const queries = JSON.parse(readFileSync(path.join(root, "scripts/benchmark/queries.json"), "utf8")).queries;

const round = (value, digits = 2) => Number(value.toFixed(digits));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const toQuery = (params) => ({ page: 1, limit: 10, ...params, q: params.q ?? "" });

// --- 1. CPU profile of one cold hydration -----------------------------------

function profileColdHydration() {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "hydration-profile-"));
  const stdout = execFileSync(process.execPath, ["--cpu-prof", `--cpu-prof-dir=${profileDir}`, path.join(root, "scripts/benchmark/hydrate-once.cjs"), indexDir], { encoding: "utf8", maxBuffer: 64 * 2 ** 20 });
  const timings = JSON.parse(stdout);
  const profileFile = readdirSync(profileDir).find((file) => file.endsWith(".cpuprofile"));
  const profile = JSON.parse(readFileSync(path.join(profileDir, profileFile), "utf8"));
  mkdirSync(outDir, { recursive: true });
  cpSync(path.join(profileDir, profileFile), path.join(outDir, "hydration.cpuprofile"));
  rmSync(profileDir, { recursive: true, force: true });

  // Self time per function: each sample is attributed to the node on top of the stack.
  const selfMicros = new Map();
  const nodeById = new Map(profile.nodes.map((node) => [node.id, node]));
  profile.samples.forEach((nodeId, index) => {
    selfMicros.set(nodeId, (selfMicros.get(nodeId) ?? 0) + (profile.timeDeltas[index] ?? 0));
  });
  const byFunction = new Map();
  let totalMicros = 0;
  for (const [nodeId, micros] of selfMicros) {
    const frame = nodeById.get(nodeId).callFrame;
    const file = frame.url ? path.basename(frame.url) : "";
    const name = `${frame.functionName || "(anonymous)"}${file ? ` — ${file}` : ""}`;
    byFunction.set(name, (byFunction.get(name) ?? 0) + micros);
    totalMicros += micros;
  }
  const top = [...byFunction.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, micros]) => ({ function: name, selfMs: round(micros / 1000, 1), percent: round((micros / totalMicros) * 100, 1) }));
  return { timings, top, sampledMs: round(totalMicros / 1000, 1) };
}

// --- 2. Cold, persistent, and incremental costs ------------------------------

async function measureCold() {
  const runs = [];
  for (let run = 0; run < coldRuns; run++) {
    const startedAt = performance.now();
    const engine = new Engine(indexDir);
    await engine.sync();
    const hydratedAt = performance.now();
    engine.search(toQuery(queries[0].params));
    runs.push({ hydrateMs: hydratedAt - startedAt, hydrateAndFirstQueryMs: performance.now() - startedAt });
  }
  return runs;
}

async function measurePersistent() {
  const engine = new Engine(indexDir);
  await engine.sync();
  for (let i = 0; i < 100; i++) engine.search(toQuery(queries[i % queries.length].params));
  const samples = [];
  for (let i = 0; i < 2000; i++) {
    const startedAt = performance.now();
    engine.search(toQuery(queries[i % queries.length].params));
    samples.push(performance.now() - startedAt);
  }
  samples.sort((a, b) => a - b);
  return { queries: samples.length, meanMs: mean(samples), p95Ms: samples[Math.ceil(samples.length * 0.95) - 1] };
}

async function measureIncremental() {
  // Work on a copy so the benchmark corpus itself is never modified.
  const copy = mkdtempSync(path.join(os.tmpdir(), "hydration-incremental-"));
  try {
    cpSync(indexDir, copy, { recursive: true });
    const engine = new Engine(copy);
    await engine.sync();
    const manifest = readManifest(copy);
    const writer = new IndexWriter(copy);
    const runs = [];
    // Republish existing batches as updates: each is 250 replacements, the
    // same work a re-crawl of 250 pages produces.
    for (const entry of manifest.batches.slice(0, 5)) {
      const operations = readBatch(copy, entry);
      writer.publish(operations);
      const deadBefore = engine.status().deadPostingsDocs;
      const startedAt = performance.now();
      await engine.sync();
      const applyMs = performance.now() - startedAt;
      // Replaced documents leave tombstones; past a threshold the engine
      // rebuilds its postings in memory, which shows up as one slow batch.
      runs.push({ operations: operations.length, applyMs, rebuiltInMemory: engine.status().deadPostingsDocs < deadBefore });
    }
    return runs;
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

const profiled = profileColdHydration();
const cold = await measureCold();
const persistent = await measurePersistent();
const incremental = await measureIncremental();

const coldMean = mean(cold.map((run) => run.hydrateAndFirstQueryMs));
const plainBatches = incremental.filter((run) => !run.rebuiltInMemory);
const incrementalMean = mean((plainBatches.length ? plainBatches : incremental).map((run) => run.applyMs));
const result = {
  recordedAt: new Date().toISOString(),
  indexDir: path.relative(root, indexDir),
  hardware: { cpu: os.cpus()[0]?.model, logicalCores: os.cpus().length, memoryGb: round(os.totalmem() / 2 ** 30, 1) },
  node: process.version,
  documents: profiled.timings.documents,
  terms: profiled.timings.terms,
  profiledHydration: {
    note: "Single cold hydration under the V8 sampling profiler; profiling adds overhead, so use the unprofiled runs below for absolute times.",
    hydrateMs: round(profiled.timings.hydrateMs, 1),
    readMs: round(profiled.timings.readMs, 1),
    applyMs: round(profiled.timings.applyMs, 1),
    readShare: round((profiled.timings.readMs / (profiled.timings.readMs + profiled.timings.applyMs)) * 100, 1),
    topSelfTime: profiled.top,
    batches: profiled.timings.batches.map((batch) => ({ ...batch, readMs: round(batch.readMs, 2), applyMs: round(batch.applyMs, 2) })),
  },
  cold: {
    runs: cold.map((run) => ({ hydrateMs: round(run.hydrateMs, 1), hydrateAndFirstQueryMs: round(run.hydrateAndFirstQueryMs, 1) })),
    meanHydrateAndFirstQueryMs: round(coldMean, 1),
  },
  persistent: { queries: persistent.queries, meanQueryMs: round(persistent.meanMs, 3), p95QueryMs: round(persistent.p95Ms, 3) },
  incremental: {
    runs: incremental.map((run) => ({ operations: run.operations, applyMs: round(run.applyMs, 1), rebuiltInMemory: run.rebuiltInMemory })),
    meanBatchMs: round(incrementalMean, 1),
  },
  comparison: {
    coldVsPersistentQuery: round(coldMean / persistent.meanMs, 0),
    fullHydrationVsOneBatch: round(mean(cold.map((run) => run.hydrateMs)) / incrementalMean, 1),
  },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "hydration.json"), JSON.stringify(result, null, 2) + "\n");

const p = result.profiledHydration;
const markdown = `# Index hydration: profile and comparison

Recorded ${result.recordedAt} on ${result.hardware.cpu} (${result.hardware.logicalCores} logical cores, ${result.hardware.memoryGb} GB), Node ${result.node}.
Index: \`${result.indexDir}\` — ${result.documents.toLocaleString("en-US")} documents, ${result.terms.toLocaleString("en-US")} distinct terms.

This is a controlled measurement of the engine in a standalone Node process. It
quantifies the cost of loading the index before a query can be answered, and
what keeping the index loaded avoids. It is a reconstructed comparison, not a
record of a production incident.

## Where hydration time goes

One cold hydration under the V8 sampling profiler (\`hydration.cpuprofile\`, loadable in Chrome DevTools) took ${p.hydrateMs} ms.

Timing trace per phase, summed over ${p.batches.length} batches:

| Phase | Time (ms) | Share |
|---|---:|---:|
| Read, checksum, and parse batch files | ${p.readMs} | ${p.readShare}% |
| Tokenize and build postings | ${p.applyMs} | ${round(100 - p.readShare, 1)}% |

Top functions by self time:

| Function | Self time (ms) | Share of samples |
|---|---:|---:|
${p.topSelfTime.map((row) => `| \`${row.function.replace(/\|/g, "\\|")}\` | ${row.selfMs} | ${row.percent}% |`).join("\n")}

## Cost of each approach

| Approach | What is paid | Measured |
|---|---|---:|
| Cold (baseline) | Hydrate the full index, then answer one query | ${result.cold.meanHydrateAndFirstQueryMs} ms (mean of ${result.cold.runs.length} runs: ${result.cold.runs.map((run) => run.hydrateAndFirstQueryMs).join(", ")}) |
| Persistent | Answer from the already loaded index | ${result.persistent.meanQueryMs} ms mean, ${result.persistent.p95QueryMs} ms p95 over ${result.persistent.queries.toLocaleString("en-US")} queries |
| Incremental | Apply one published batch of ${result.incremental.runs[0]?.operations ?? 250} replacements to the loaded index | ${result.incremental.meanBatchMs} ms mean (${result.incremental.runs.map((run) => `${run.applyMs}${run.rebuiltInMemory ? " with tombstone rebuild" : ""}`).join(", ")}) |

- A query that has to hydrate first costs about ${result.comparison.coldVsPersistentQuery.toLocaleString("en-US")}× a query against the persistent index.
- Applying a 250-document batch costs about 1/${result.comparison.fullHydrationVsOneBatch} of a full hydration, so new documents do not require reloading the index.
- Each replacement tokenizes the outgoing and the incoming version. When tombstoned documents exceed a quarter of the live ones the engine rebuilds its postings in memory; batches where that happened are marked above and excluded from the batch mean.

Engine times here exclude HTTP; see \`benchmark.md\` for full request latency.
`;
writeFileSync(path.join(outDir, "hydration.md"), markdown);
console.log(markdown);
