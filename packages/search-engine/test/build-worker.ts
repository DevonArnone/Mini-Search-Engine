import { execFileSync } from "node:child_process";
import * as path from "node:path";

// The worker tests run the compiled worker, exactly as the server does.
export default function setup(): void {
  const root = path.resolve(__dirname, "..");
  execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", path.join(root, "tsconfig.build.json")], { stdio: "inherit" });
}
