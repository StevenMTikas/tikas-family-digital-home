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

async function main() {
  // Static `import` declarations are hoisted above top-level statements, so
  // the app modules below MUST be imported dynamically, after loadEnv() has
  // actually run — otherwise anything reading an env var at module scope
  // would see it unset. (Verified: a static import evaluates its dependency
  // before the preceding statement runs.)
  loadEnv();

  const { getLastAgentRunAt, hoursSince } = await import("../lib/core/ai/scheduler");
  const { runGuardianCheck } = await import("../lib/core/ai/guardian");
  const { runAdvisorDetectors, expireStaleSuggestions } = await import("../lib/core/ai/advisor");
  const { purgeOldSecurityEvents } = await import("../lib/core/logging");
  const { runBackup, getLastBackup } = await import("../lib/core/backup");

  try {
    const lastGuardian = getLastAgentRunAt("guardian");
    if (!lastGuardian || hoursSince(lastGuardian) >= GUARDIAN_INTERVAL_HOURS) {
      await runGuardianCheck();
    }
  } catch (err) {
    console.error("[scheduler-hourly] Guardian check failed:", err);
  }

  try {
    const lastAdvisor = getLastAgentRunAt("advisor");
    if (!lastAdvisor || hoursSince(lastAdvisor) >= ADVISOR_INTERVAL_HOURS) {
      await runAdvisorDetectors("weekly_check");
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
}

main().then(() => process.exit(0));
