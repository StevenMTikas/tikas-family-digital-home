# Monitoring

## Purpose

Defines the Monitoring screen — the fuller system health detail that `Admin_Dashboard.md`'s summary card links out to. Displays Guardian's last daily scheduled system health check (per `Guardian.md`'s once-a-day MVP cadence), not a live, on-demand check for MVP.

## Goals

- Give the Super Admin a genuinely useful, detailed view of system health, one level deeper than the Admin Dashboard's quick summary.
- Keep MVP honest about its snapshot nature — this reflects Guardian's last scheduled run, not the current live state — while clearly marking live-on-view as the commercial-version upgrade.

## User Stories

- As the Super Admin, I want to see the full detail behind the Admin Dashboard's health summary — not just "okay/not okay," but what's actually being tracked.
- As the Super Admin, I want to understand that what I'm looking at is from the last daily check, not necessarily this exact moment, so I don't mistake it for real-time status.

## Features

- **Full system health detail**, expanding on `Guardian.md`'s system health monitoring list:
  - Backup status (last successful backup, any failures)
  - Disk space
  - Sync status across connectors (per `File_Connector_Architecture.md`)
  - Device connectivity (any trusted device that hasn't synced in an unexpectedly long time)
- **Last daily snapshot, clearly timestamped.** Every value shown reflects Guardian's most recent scheduled check (once per day for MVP, per `Guardian.md`), with the check's timestamp displayed clearly so it's never mistaken for a live, current-moment status.
- **No live/on-demand refresh for MVP.** An admin viewing this screen sees the same data until Guardian's next scheduled run — there's no "check now" button in MVP.

## Screen Layout

- **Timestamp banner:** "Last checked: [date/time]" displayed prominently at the top, so the snapshot nature of the data is always clear.
- **Status cards, one per monitored area:** Backup, Disk Space, Sync Status, Device Connectivity — each showing its current (as-of-last-check) status, with urgent issues visually distinct per `Notifications.md`'s severity treatment.
- Links back to `Admin_Dashboard.md` and out to relevant detail screens (e.g., `06_Admin/Backup.md` for backup specifics, `File_Connector_Architecture.md`-related device/sync detail).

## Data Stored

- No new entities — this screen displays the results of Guardian's existing scheduled monitoring pass (per `Guardian.md`), which is logged via the shared logging service (`Security_Architecture.md`, `Application_Architecture.md`). If a dedicated snapshot record proves useful for displaying "last checked" cleanly, it can reuse the same logging/event data rather than introducing a new entity.

## AI Responsibilities

- No new AI behavior — Guardian already performs this check on its existing daily schedule (`Guardian.md`); this screen only displays the result.

## Permissions

- Super Admin only, consistent with `Administration.md`'s existing rule that technical monitoring tools are Super Admin-exclusive and MVP-only (not present in a future commercial version's admin experience, per `Security_Architecture.md`).

## Dependencies

- Builds on `Guardian.md` (the monitoring logic and schedule this screen displays), `Admin_Dashboard.md` (the summary this screen expands on), `Notifications.md` (severity/urgent styling), and `File_Connector_Architecture.md` (sync/device connectivity detail).

## Future Enhancements

- **Live, on-demand refresh** for a commercial version — replacing the MVP's daily-snapshot-only model with a "check now" capability, as already flagged in this document's Purpose.
- Historical trend view (e.g., disk space over time), if useful once real usage data exists.

## Questions

None currently open.
