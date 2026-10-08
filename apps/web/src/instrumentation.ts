// Starts hydrating the native index when the server boots, so the first
// request does not pay for it. The Node-only code sits behind a runtime check
// the bundler can evaluate, which keeps it out of the edge build.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
