import { existsSync, readFileSync } from "fs";
import path from "path";

// The index directory defaults to <repository root>/data/search-index, the
// same location the crawler publishes to when SEARCH_INDEX_DIR is unset.
function defaultIndexDir() {
  let directory = process.cwd();
  for (;;) {
    const manifest = path.join(directory, "package.json");
    if (existsSync(manifest)) {
      try {
        if (JSON.parse(readFileSync(manifest, "utf8")).workspaces) break;
      } catch {
        // Unreadable manifest: keep walking up.
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      directory = process.cwd();
      break;
    }
    directory = parent;
  }
  return path.join(directory, "data", "search-index");
}

function searchBackend(): "native" | "meilisearch" {
  const value = (process.env.SEARCH_BACKEND ?? "native").trim().toLowerCase();
  if (value === "native" || value === "meilisearch") return value;
  throw new Error(`SEARCH_BACKEND must be "native" or "meilisearch", received "${value}"`);
}

export const env = {
  searchBackend: searchBackend(),
  searchIndexDir: process.env.SEARCH_INDEX_DIR ? path.resolve(process.env.SEARCH_INDEX_DIR) : defaultIndexDir(),
  searchIndexPollMs: Number(process.env.SEARCH_INDEX_POLL_MS ?? "1000"),
  searchEngineWorkerPath: process.env.SEARCH_ENGINE_WORKER_PATH ?? null,
  meiliHost: process.env.MEILI_HOST ?? "http://localhost:7700",
  meiliMasterKey: process.env.MEILI_MASTER_KEY ?? "mini_search_master_key",
  meiliIndexName: "documents",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://mini_search:mini_search@localhost:5432/mini_search",
  searchTimeoutMs: Number(process.env.SEARCH_TIMEOUT_MS ?? "4000"),
  databaseTimeoutMs: Number(process.env.DATABASE_TIMEOUT_MS ?? "5000"),
  enableDemoMode: process.env.SEARCH_DEMO_MODE === "true",
};
