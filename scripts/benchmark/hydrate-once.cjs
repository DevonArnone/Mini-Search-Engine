// Hydrates an index directory once, in this process, and prints timings as
// JSON. Run under `node --cpu-prof` by profile-hydration.mjs.
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const dist = path.resolve(__dirname, "../../packages/search-engine/dist");
const { Engine } = require(path.join(dist, "engine.js"));

async function main() {
  const indexDir = process.argv[2];
  const batches = [];
  const engine = new Engine(indexDir, { onTiming: (event) => batches.push(event) });
  const startedAt = performance.now();
  await engine.sync();
  const hydrateMs = performance.now() - startedAt;
  const status = engine.status();
  if (status.state !== "ready") throw new Error(`index is ${status.state}: ${status.lastError}`);

  const queryStartedAt = performance.now();
  const output = engine.search({ q: "function", page: 1, limit: 10 });
  const firstQueryMs = performance.now() - queryStartedAt;

  process.stdout.write(
    JSON.stringify({
      documents: status.documents,
      terms: status.terms,
      hydrateMs,
      firstQueryMs,
      firstQueryHits: output.totalHits,
      readMs: batches.reduce((sum, batch) => sum + batch.readMs, 0),
      applyMs: batches.reduce((sum, batch) => sum + batch.applyMs, 0),
      batches: batches.map((batch) => ({ seq: batch.seq, operations: batch.operations, readMs: batch.readMs, applyMs: batch.applyMs })),
      memory: status.memory,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
