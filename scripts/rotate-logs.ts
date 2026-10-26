// Rotates the app's flat log files when they pass a size cap. Run at the start
// of every hourly scheduler tick (see scheduler-hourly.bat) — that cadence
// covers server.log too, which the web-server task appends to continuously and
// would otherwise only ever be rotated on a restart. See
// lib/core/logging/rotate.ts for why this is copy-then-truncate.

import path from "path";
import { rotateLogIfLarge } from "../lib/core/logging/rotate";

const LOG_FILES = ["server.log", "scheduler-hourly.log", "scheduler-reminders.log"];
const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 3;

const root = path.join(__dirname, "..");
for (const name of LOG_FILES) {
  try {
    if (rotateLogIfLarge(path.join(root, name), { maxBytes: MAX_BYTES, keep: KEEP })) {
      console.log(`[rotate-logs] ${new Date().toISOString()} rotated ${name}`);
    }
  } catch (err) {
    // Never block the scheduler tick that follows over a housekeeping failure.
    console.error(`[rotate-logs] could not rotate ${name}:`, err);
  }
}
