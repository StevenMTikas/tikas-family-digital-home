// TEMPORARY diagnostic logging for the 2026-08-24 background-location
// investigation. Fire-and-forget: a logging call must never throw or block
// the real work it's instrumenting — if the log post fails (no network, not
// paired yet), that's just a missed log entry, not a reason to fail the
// task it's inside of. Remove this file (and its call sites in location.ts)
// once the root cause is found. See Location_Tracking.md.

import { loadPairing } from "./pairing";
import { postDebugLog } from "./api";

export function logEvent(eventType: string, detail?: unknown): void {
  loadPairing()
    .then((pairing) => {
      if (!pairing) return;
      return postDebugLog(pairing, eventType, detail);
    })
    .catch((err) => console.warn("[debug-log] failed to post:", err));
}
