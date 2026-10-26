// TEMPORARY diagnostic logging for the push-triggered location refresh — see
// docs/02_Modules/Location_Tracking.md.
//
// WHY IT STAYS FOR NOW: the original investigation (why continuous background
// location never delivered on battery) concluded — Doze defeats it — and the
// continuous stream is gone. But its replacement, waking the phone with a
// high-priority push, has never been run on a real device. This log is the
// only way to see from the host whether a push woke the phone, how long it
// took, and whether the fix taken during the wake was genuinely fresh
// (fix_*.fixAgeSeconds) rather than a stale cache hit.
//
// REMOVE WHEN: a push refresh has been verified on a real phone — unplugged,
// locked, and idle for 30+ minutes — and the result recorded in
// Location_Tracking.md. Removal is: delete this file, its logEvent() call
// sites (location.ts, push.ts), postDebugLog in api.ts, the host's
// app/api/connectors/debug-log route, and the connector_debug_logs table.
//
// Fire-and-forget: a logging call must never throw or block the real work it
// is instrumenting — a failed post is just a missed log line.

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
