import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Matches Next.js: JSX compiles without a React import in scope.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "@mini-search/shared-types": path.resolve(
        rootDir,
        "../../packages/shared-types/src/index.ts",
      ),
      "@mini-search/search-engine": path.resolve(
        rootDir,
        "../../packages/search-engine/src/index.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**"],
  },
});
