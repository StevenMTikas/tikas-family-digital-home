// Loads .env.local for the standalone scheduler scripts.
//
// Next.js loads .env.local automatically for the web app; a plain `tsx`
// process does not, so the scheduler scripts have to do it themselves or
// they'd run against the wrong DATABASE_PATH and with no encryption keys.
//
// Done explicitly here rather than via a `--env-file` CLI flag so the
// scripts behave identically however they're invoked (Task Scheduler, a
// terminal, a different working directory).

import fs from "fs";
import path from "path";

export function loadEnv(): void {
  const envPath = path.join(__dirname, "..", ".env.local");

  // Missing .env.local is a real, recoverable setup state (a fresh checkout
  // that hasn't been configured yet). process.loadEnvFile throws on a missing
  // file, which would turn that into an opaque scheduled-task failure — warn
  // clearly instead and let the caller fail on the specific thing it needs.
  if (!fs.existsSync(envPath)) {
    console.warn(`[scheduler] No .env.local at ${envPath} — continuing with the ambient environment only.`);
    return;
  }

  process.loadEnvFile(envPath);
}
