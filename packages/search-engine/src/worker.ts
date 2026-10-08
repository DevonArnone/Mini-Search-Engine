import { performance } from "node:perf_hooks";
import { parentPort, workerData } from "node:worker_threads";

import { Engine, EngineNotReadyError } from "./engine";
import type { WorkerOptions, WorkerRequest, WorkerResponse, WorkerResult } from "./protocol";

// One of these runs per server process. It hydrates the index once, keeps it
// in memory, and answers requests in arrival order on a single thread.

if (!parentPort) throw new Error("search engine worker must be started as a worker thread");
const port = parentPort;
const options = workerData as WorkerOptions;
const engine = new Engine(options.indexDir);

const round = (ms: number) => Math.round(ms * 1000) / 1000;

function handle(request: WorkerRequest): WorkerResult | Promise<WorkerResult> {
  switch (request.type) {
    case "search": {
      const startedAt = performance.now();
      const output = engine.search(request.query);
      return { ...output, processingTimeMs: round(performance.now() - startedAt), indexRevision: engine.indexRevision };
    }
    case "autocomplete": {
      const startedAt = performance.now();
      const suggestions = engine.autocomplete(request.q);
      return { suggestions, processingTimeMs: round(performance.now() - startedAt) };
    }
    case "facets":
      return engine.facets();
    case "status":
      return engine.status();
    case "sync":
      return engine.sync().then(() => engine.status());
  }
}

port.on("message", (request: WorkerRequest) => {
  const reply = (response: WorkerResponse) => port.postMessage(response);
  const fail = (error: unknown) =>
    reply({
      id: request.id,
      ok: false,
      error: {
        code: error instanceof EngineNotReadyError ? "not_ready" : "failed",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  try {
    const result = handle(request);
    if (result instanceof Promise) result.then((value) => reply({ id: request.id, ok: true, result: value }), fail);
    else reply({ id: request.id, ok: true, result });
  } catch (error) {
    fail(error);
  }
});

void engine.sync();
// Polling (rather than fs.watch) behaves the same on local disks and shared volumes.
const timer = setInterval(() => {
  if (engine.needsSync()) void engine.sync();
}, options.pollMs);
timer.unref();
