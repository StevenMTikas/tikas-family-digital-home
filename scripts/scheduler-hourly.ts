// One-shot scheduler tick — Guardian's daily check, Advisor's weekly check,
// suggestion expiration, the daily backup, and the security-event purge.
// Run hourly via a Windows Scheduled Task instead of Next.js's
// instrumentation.ts: production `next start` silently breaks when
// instrumentation.ts dynamically imports a local Node-only sibling module —
// a genuine, unresolved Next.js bug (see vercel/next.js#77776 — the same
// documented pattern from Next's own instrumentation guide, works fine in
// `next dev`, never in production). Decoupling the scheduler into its own
// process sidesteps that bug entirely and, as a bonus, no longer depends on
// the web server process being up to keep running.
//
// Mirrors the old instrumentation-node.ts's tick() exactly — same functions,
// same due-check logic — just invoked once per run instead of via
// setInterval. Run via: npx tsx scripts/scheduler-hourly.ts (tsx resolves
// both the TypeScript and the "@/" tsconfig path aliases this file's
// dependencies use internally — see scheduler-hourly.bat and the Task
// Scheduler setup notes in Future_Ideas.md).

import { loadEnv } from "./load-env";

const GUARDIAN_INTERVAL_HOURS = 24; // Guardian.md: "MVP: runs once per day"
const ADVISOR_INTERVAL_HOURS = 24 * 7; // Advisor.md: "a weekly check"
const BACKUP_INTERVAL_HOURS = 24; // Backup.md: "automatic daily backup"

// The weekly Advisor check runs ~370+ individual LLM calls the first time a
// large backlog builds up (confirmed live: ~2 hours for 1,722), which is
// real CPU load — Steven does remote tech support M-F 9-6 EST and can't have
// that competing for the machine during work hours. Restricting it to a
// quiet overnight window keeps the same "about once a week" cadence — if the
// 7-day mark is reached outside this window, it just waits for the next
// occurrence of it, up to ~24h later, rather than skipping a cycle.
const ADVISOR_QUIET_HOURS = [2, 3]; // local server time

async function main() {
  // Static `import` declarations are hoisted above top-level statements, so
  // the app modules below MUST be imported dynamically, after loadEnv() has
  // actually run — otherwise anything reading an env var at module scope
  // would see it unset. (Verified: a static import evaluates its dependency
  // before the preceding statement runs.)
  loadEnv();

  const { getLastAgentRunAt, hoursSince } = await import("../lib/core/ai/scheduler");
  const { runGuardianCheck } = await import("../lib/core/ai/guardian");
  const { runMemoryExtraction } = await import("../lib/core/ai/memory-extraction");
  const { runAdvisorDetectors, expireStaleSuggestions } = await import("../lib/core/ai/advisor");
  const { purgeOldSecurityEvents } = await import("../lib/core/logging");
  const { purgeOldLocationReports } = await import("../lib/core/location");
  const { runBackup, getLastBackup } = await import("../lib/core/backup");
  const { generateUpcomingEventOccurrences, generateUpcomingTaskOccurrences } = await import("../lib/core/recurrence");
  const { runHostFolderScan } = await import("../lib/core/connectors/hostScan");
  const { createNotification } = await import("../lib/core/notifications");
  const { getDb } = await import("../db/client");

  try {
    const lastGuardian = getLastAgentRunAt("guardian");
    if (!lastGuardian || hoursSince(lastGuardian) >= GUARDIAN_INTERVAL_HOURS) {
      await runGuardianCheck();
    }
  } catch (err) {
    console.error("[scheduler-hourly] Guardian check failed:", err);
  }

  // Per-user daily cadence, checked individually inside the function — see
  // memory-extraction.ts. Cheap to call every hourly tick since most users
  // will just be skipped as "not due yet" (a DB read, not an LLM call).
  try {
    await runMemoryExtraction();
  } catch (err) {
    console.error("[scheduler-hourly] Memory extraction pass failed:", err);
  }

  try {
    const lastAdvisor = getLastAgentRunAt("advisor");
    const dueForWeeklyCheck = !lastAdvisor || hoursSince(lastAdvisor) >= ADVISOR_INTERVAL_HOURS;
    if (dueForWeeklyCheck && ADVISOR_QUIET_HOURS.includes(new Date().getHours())) {
      const created = await runAdvisorDetectors("weekly_check");

      // Lets the Super Admin know the overnight run actually happened,
      // rather than it being invisible unless they go looking at Suggestion
      // History — same "notify the Super Admin" pattern Guardian already
      // uses for its own passive findings.
      const superAdmin = getDb().prepare(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`).get() as
        | { id: string }
        | undefined;
      if (superAdmin) {
        await createNotification({
          userId: superAdmin.id,
          text:
            created > 0
              ? `Weekly suggestion review completed — ${created} new suggestion${created === 1 ? "" : "s"}.`
              : "Weekly suggestion review completed — nothing new to suggest.",
          severity: "routine",
        });
      }
    }
  } catch (err) {
    console.error("[scheduler-hourly] Advisor weekly check failed:", err);
  }

  try {
    await expireStaleSuggestions();
  } catch (err) {
    console.error("[scheduler-hourly] Suggestion expiration pass failed:", err);
  }

  try {
    const lastBackup = await getLastBackup();
    if (!lastBackup || hoursSince(lastBackup.createdAt) >= BACKUP_INTERVAL_HOURS) {
      await runBackup();
    }
  } catch (err) {
    console.error("[scheduler-hourly] Daily backup failed:", err);
  }

  try {
    await purgeOldSecurityEvents();
  } catch (err) {
    console.error("[scheduler-hourly] Security event purge failed:", err);
  }

  // 7-day rolling retention for location_reports — see Location_Tracking.md.
  try {
    purgeOldLocationReports();
  } catch (err) {
    console.error("[scheduler-hourly] Location report purge failed:", err);
  }

  // Keeps every recurring Event/Task series topped up ~3 months ahead so an
  // "indefinite" series never runs dry without the user having to act.
  try {
    generateUpcomingEventOccurrences();
    generateUpcomingTaskOccurrences();
  } catch (err) {
    console.error("[scheduler-hourly] Recurrence top-up failed:", err);
  }

  // Scans the host machine's own dashboard-managed folders — see
  // lib/core/connectors/hostScan.ts. Runs every tick (not gated) since it's
  // cheap local disk I/O, no network involved.
  try {
    await runHostFolderScan();
  } catch (err) {
    console.error("[scheduler-hourly] Host folder scan failed:", err);
  }
}

main().then(() => process.exit(0));
