// Node-only half of the startup scheduler, kept in its own file per
// Next.js's documented workaround: instrumentation.ts's register() still
// gets bundled for the Edge runtime even when its body is guarded by a
// NEXT_RUNTIME check, so anything that transitively imports Node built-ins
// (fs, path, better-sqlite3, via db/client.ts) has to live in a separate
// module that's only ever reached through a dynamic import() from the
// nodejs-only branch — see instrumentation.ts.

import { getLastAgentRunAt, hoursSince } from "./lib/core/ai/scheduler";
import { runGuardianCheck } from "./lib/core/ai/guardian";
import { runAdvisorDetectors, expireStaleSuggestions } from "./lib/core/ai/advisor";
import { purgeOldSecurityEvents } from "./lib/core/logging";
import { runBackup, getLastBackup } from "./lib/core/backup";
import { checkAndFireReminders } from "./lib/core/notifications/reminders";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const GUARDIAN_INTERVAL_HOURS = 24; // Guardian.md: "MVP: runs once per day"
const ADVISOR_INTERVAL_HOURS = 24 * 7; // Advisor.md: "a weekly check"
const BACKUP_INTERVAL_HOURS = 24; // Backup.md: "automatic daily backup"

// Reminders get their own, much shorter interval than the hourly tick above —
// Calendar.md/Tasks.md call these "real-time reminders," and the shortest
// lead-time option (15 minutes before) would be routinely missed or fired
// nearly an hour late if it only ran on the same cadence as Guardian/Advisor.
const REMINDER_CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

async function tick() {
  try {
    const lastGuardian = getLastAgentRunAt("guardian");
    if (!lastGuardian || hoursSince(lastGuardian) >= GUARDIAN_INTERVAL_HOURS) {
      await runGuardianCheck();
    }
  } catch (err) {
    console.error("[scheduler] Guardian check failed:", err);
  }

  try {
    const lastAdvisor = getLastAgentRunAt("advisor");
    if (!lastAdvisor || hoursSince(lastAdvisor) >= ADVISOR_INTERVAL_HOURS) {
      await runAdvisorDetectors("weekly_check");
    }
  } catch (err) {
    console.error("[scheduler] Advisor weekly check failed:", err);
  }

  try {
    await expireStaleSuggestions();
  } catch (err) {
    console.error("[scheduler] Suggestion expiration pass failed:", err);
  }

  try {
    const lastBackup = await getLastBackup();
    if (!lastBackup || hoursSince(lastBackup.createdAt) >= BACKUP_INTERVAL_HOURS) {
      await runBackup();
    }
  } catch (err) {
    console.error("[scheduler] Daily backup failed:", err);
  }

  try {
    await purgeOldSecurityEvents();
  } catch (err) {
    console.error("[scheduler] Security event purge failed:", err);
  }
}

async function reminderTick() {
  try {
    await checkAndFireReminders();
  } catch (err) {
    console.error("[scheduler] Reminder check failed:", err);
  }
}

export function startScheduler() {
  tick();
  setInterval(tick, CHECK_INTERVAL_MS);

  reminderTick();
  setInterval(reminderTick, REMINDER_CHECK_INTERVAL_MS);
}
