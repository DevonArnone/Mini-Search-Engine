import { existsSync } from "fs";
import path from "path";

import { EngineClient } from "@mini-search/search-engine";

import { env } from "@/lib/env";

// One engine worker per server process. The handle lives on globalThis so
// every route bundle (and every dev-mode reload) shares the same worker and
// the index is hydrated once.
const globalStore = globalThis as typeof globalThis & { __devdocsEngine?: EngineClient };

const WORKER_RELATIVE_PATH = path.join("node_modules", "@mini-search", "search-engine", "dist", "worker.js");

// The worker is a plain compiled script, not part of the server bundle. It is
// located on disk by walking up from the working directory, the same way Node
// finds node_modules, so the bundler never sees (or rewrites) the lookup.
function resolveWorkerPath() {
  if (env.searchEngineWorkerPath) return path.resolve(env.searchEngineWorkerPath);
  let directory = process.cwd();
  for (;;) {
    const candidate = path.join(directory, WORKER_RELATIVE_PATH);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("search engine worker not found; run `npm run build` or set SEARCH_ENGINE_WORKER_PATH");
    }
    directory = parent;
  }
}

export function getNativeEngine(): EngineClient {
  if (!globalStore.__devdocsEngine) {
    globalStore.__devdocsEngine = new EngineClient({
      workerPath: resolveWorkerPath(),
      indexDir: env.searchIndexDir,
      pollMs: env.searchIndexPollMs,
      requestTimeoutMs: env.searchTimeoutMs,
    });
  }
  return globalStore.__devdocsEngine;
}
