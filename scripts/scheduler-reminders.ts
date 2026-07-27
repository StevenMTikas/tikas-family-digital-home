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

main().then(() => process.exit(0));
