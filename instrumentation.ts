// Next.js startup hook — runs once when the server process starts. Used
// here as the "background, scheduled" mechanism Guardian.md and Advisor.md
// call for (daily and weekly runs, respectively), since this is a
// self-hosted single-process app with no separate job-queue infrastructure.
//
// The actual scheduler logic lives in instrumentation-node.ts, reached only
// via the dynamic import below — Next.js bundles this file for both the
// Node.js and Edge runtimes regardless of the runtime check inside
// register(), so anything that transitively needs Node built-ins (fs, path,
// better-sqlite3) has to stay out of this file entirely.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./instrumentation-node");
    startScheduler();
  }
}
