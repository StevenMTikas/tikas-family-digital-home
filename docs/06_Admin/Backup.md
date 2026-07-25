# Backup

## Purpose

Defines how Tikas Family Digital Home's data is backed up and restored. Builds on prior decisions already made: local storage for MVP with cloud storage planned later (`Decision_Log.md` context), and "encrypted whenever possible" at rest (`Security_Architecture.md`). Specifics not yet decided elsewhere (frequency, retention, restore flow) are drafted here using judgment from established patterns — flagged where genuinely open.

## Goals

- Protect the family's data — documents, photos, memories, family knowledge, everything in the database — against loss, consistent with `Cursor_Project_Rules.md`'s "every destructive action is reversible" spirit applied at the system level.
- Keep MVP backup simple and local, while being honest that local-only backup has a real gap worth the Super Admin's awareness.
- Give Guardian's existing backup-status monitoring (`Guardian.md`) something concrete to actually check.

## User Stories

- As the Super Admin, I want the system backed up automatically, without having to remember to do it myself.
- As the Super Admin, I want to know if a backup ever fails, not discover it only when I need to restore something.
- As the Super Admin, I want a way to restore from a backup if something goes badly wrong.

## Features

- **Automatic daily backup**, consistent with the daily cadence already established elsewhere (connector sync, Guardian's monitoring check) — one full backup per day, no user action required.
- **What's backed up:** the full SQLite database (all family data — Users, Events, Tasks, Documents metadata, Photos metadata, Memories, Family Knowledge, Password Entries, AI_Memory, etc.) plus locally stored files (uploaded Documents, Photos actually held on the host rather than pulled on-demand from a connector).
- **Local storage for MVP**, per prior direction — backups are stored locally, not yet sent to the cloud (cloud backup remains a tracked future item, per `Decision_Log.md` and `Data_Flow.md`'s prior references).
- **Rolling retention.** Keep the last 7 daily backups for MVP, rotating out older ones automatically — bounded, predictable storage use rather than accumulating indefinitely (see Questions for a caveat on this default).
- **Encrypted, consistent with `Security_Architecture.md`.** Backups follow the same "encrypted whenever possible" standard already established for data at rest.
- **Manual restore, Super Admin only.** For MVP, restoring from a backup is a deliberate, manual action taken by the Super Admin — not automatic — given how consequential a restore is.
- **Backup status feeds Guardian and the Admin Dashboard.** Success/failure of each day's backup is exactly what `Guardian.md`'s system health monitoring and `Monitoring.md`'s status card already expect to display — this document defines the actual mechanism behind that existing status indicator.

## Screen Layout

- **Backup status view** (within `06_Admin`, linked from `Admin_Dashboard.md`/`Monitoring.md`): last backup time, success/failure, size, and a list of available backups (up to the last 7).
- **Restore action:** a clearly deliberate, confirmation-gated control — not a casual one-click action, given the consequence of overwriting current data.

## Data Stored

- No new family-data entity — backups are a system-level artifact (backup files themselves), not a `Data_Model.md` entity.
- Backup **status** (last run time, success/failure) is the same signal already referenced by `Guardian.md` and `Monitoring.md` — implemented as part of the backup mechanism itself, not a new user-facing data type.

## AI Responsibilities

- Guardian checks backup status as part of its existing daily system health monitoring (`Guardian.md`) — this document defines what that check is actually looking at, not new AI behavior.

## Permissions

- **Super Admin only** — viewing backup status and performing a restore are both Super Admin-exclusive, consistent with `Administration.md`'s and `Monitoring.md`'s existing rule that technical tools are Super Admin-only for MVP.

## Dependencies

- Builds on `Security_Architecture.md` (encryption standard, local-storage-for-MVP decision), `Guardian.md` and `Monitoring.md` (where backup status already surfaces), `Data_Model.md` (what's actually being backed up), and `File_Connector_Architecture.md` (clarifying that connector-held files, not yet pulled to the host, aren't part of this backup until requested).

## Future Enhancements

- **Cloud backup storage**, already tracked as a future item — at which point encryption in transit for backups becomes mandatory, not just "whenever possible."
- Automatic or guided restore flow, rather than MVP's fully manual process.
- Configurable retention window, rather than a fixed 7-day rolling default.

## Questions

- **Backup destination on the same physical machine as the primary data** provides no real protection if the host computer's drive itself fails. Should MVP backups be written to a *separate* physical location even while staying "local" (e.g., an external drive connected to the host), rather than another folder on the same disk? This wasn't decided elsewhere, and a same-disk backup would give false confidence without actually protecting against the most common failure mode (drive failure).
- Is 7 days of rolling retention the right default, or would you prefer a different window for MVP?
