// One-shot reminder check — fires Event/Task reminders whose lead time has
// arrived. Run every 5 minutes via a Windows Scheduled Task, separate from
// scheduler-hourly.ts, since a "real-time reminder" would be routinely late
// on an hourly cadence. See scheduler-hourly.ts's header comment for why
// this moved out of Next.js's instrumentation.ts entirely.

import { loadEnv } from "./load-env";

async function main() {
  // Dynamic import, after loadEnv() — see scheduler-hourly.ts for why a
  // static import here would defeat the env loading entirely.
  loadEnv();

  const { checkAndFireReminders } = await import("../lib/core/notifications/reminders");

  try {
    await checkAndFireReminders();
  } catch (err) {
    console.error("[scheduler-reminders] Reminder check failed:", err);
  }
}

// Per-step try/catch inside main() covers each job failing on its own, but
// not what runs outside them — loadEnv(), the dynamic imports, a thrown
// module-load error. Node would still exit non-zero on the resulting
// unhandled rejection, but with a bare stack trace and no timestamp in the
// shared .log file — this makes the failure line greppable and the exit
// code deliberate, so Task Scheduler's LastTaskResult reflects it.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[scheduler-reminders] ${new Date().toISOString()} fatal:`, err);
    process.exit(1);
  });
