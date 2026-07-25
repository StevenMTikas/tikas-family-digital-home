# Guardian

## Purpose

Defines the behavior of the Guardian — the background AI role responsible for watching over the health of the Digital Home itself and the family's use of it. Where Assistant responds and Advisor recommends, Guardian watches, on its own schedule, without being asked. Guardian's permission model (broad read, no write, suggest-only, cross-role triggering) is already defined in `AI_Permissions.md`; this document defines what it actually watches, how often, and what happens with what it finds.

## Goals

- Give Guardian a clear, bounded starter scope — system health, security events, and factual family-usage patterns — without drifting into judgment calls that belong to a human or a future, explicitly-opted-into parental control setting.
- Make sure nothing genuinely urgent gets missed by only living in a passive dashboard feed.
- Keep MVP monitoring simple (daily schedule, fact-only family observations) while clearly marking where a commercial version would need more.

## User Stories

- As the Super Admin, I want the system to watch its own health so I don't have to manually check backups, disk space, or sync status every day.
- As the Super Admin, I want to be alerted urgently when something genuinely can't wait, not just see it buried in a daily summary.
- As a family member, I want the system to notice factual patterns (like account activity) without the AI making judgments about what those patterns mean.
- As a parent, I want the option to increase monitoring depth in the future, understanding that's beyond what the MVP does today.

## Features

### What Guardian Monitors (Starter List)

**System Health**
- Backup status (last successful backup, any failures)
- Disk space
- Sync status across connectors (per `File_Connector_Architecture.md`)
- Device connectivity (a trusted device that hasn't synced in an unexpectedly long time)

**Security Events**
- Failed login attempts
- Blocked outside-call attempts (per `Security_Architecture.md`'s logging requirements)
- Permission or device trust changes

**Family-Pattern Health (Fact-Level Only for MVP)**
- Observable, factual usage patterns only — e.g., "this account hasn't been opened in 5 days," "no tasks have been completed by this user in 2 weeks."
- **Explicitly not** content judgment, sentiment analysis, or any interpretation of *why* a pattern exists — Guardian reports what's observably true, not what it might mean.
- Deeper, opt-in monitoring levels (e.g., content-aware parental monitoring) are a future, explicitly-selected parental control setting — not something Guardian does by default, and not part of MVP. See Future Enhancements.

This starter list is expected to expand as real usage reveals what's actually worth watching.

### Schedule

- **MVP: runs once per day**, on a schedule (per `AI_Architecture.md`'s "background, scheduled" design).
- **Commercial version:** frequency needs closer evaluation — likely more frequent or event-driven for urgent categories (e.g., disk space, backup failure) — noted as a future item, not decided here.

### Three Output Channels

Guardian's findings route to one of three places, depending on severity:

| Channel | Used For | MVP Delivery | Commercial Delivery (Future) |
|---|---|---|---|
| **Passive Admin Dashboard notification** | Lower-priority findings, awareness-only (e.g., a blocked outside-call attempt) | Shown on Super Admin's Admin Dashboard | Same, dashboard-based |
| **Handoff to Advisor** | Findings better framed as an actionable suggestion for a specific family member (per `Advisor.md`'s cross-role triggering) | Becomes an `AI_Suggestion`, shown per Advisor's display rules | Same |
| **Urgent direct alert** | Findings that genuinely can't wait — e.g., backup failure, disk nearly full | Shown as a distinct, urgent item on the Super Admin's Admin Dashboard, MVP | Sent via email and/or text, in addition to or instead of dashboard display |

Guardian itself decides which channel a given finding belongs in, based on severity — this classification logic lives in Guardian's own reasoning, not a fixed static table, though the categories above (system health issues affecting availability = likely urgent; routine security awareness = passive; family usage patterns = Advisor handoff) are the starting guide.

## Screen Layout

- **Admin Dashboard:** a passive notifications feed (lower-priority findings) and a visually distinct **urgent alerts** section (MVP) that stands out from routine notifications — since these need to be noticed quickly even without email/text delivery yet.
- Guardian has no user-facing chat interface of its own (unlike Assistant) — its output is always one of the three channels above, never a direct conversation.

## Data Stored

- Guardian's findings are logged as security/system events via the shared logging service (`/lib/core/logging`, per `Application_Architecture.md`, `Security_Architecture.md`) for passive and urgent items.
- Findings handed off to Advisor become standard `AI_Suggestion` records (per `Data_Model.md`, `Advisor.md`) — no separate entity needed for that path.
- **New for urgent alerts:** consider a `severity` field (routine / urgent) on whatever logging/notification record backs the Admin Dashboard feed, so urgent items can be visually distinguished — to be reflected in `06_Admin/Monitoring.md` and/or `Data_Model.md` when that's defined in detail.

## AI Responsibilities

- Runs on its own daily schedule for MVP — not triggered by any user request.
- Operates under its own dedicated Guardian role (broad read, no write, suggest-only) per `AI_Permissions.md` — this document doesn't redefine that, only what Guardian does with that access.
- Classifies each finding into one of the three output channels based on severity.
- For family-pattern observations, stays strictly at the fact level for MVP — no interpretation, judgment, or inferred cause.
- Can trigger an Advisor suggestion (per `Advisor.md`'s cross-role triggering) when a finding is better delivered as a recommendation to a specific person than a system-level notification.

## Permissions

- Fully governed by the Guardian role defined in `AI_Permissions.md` — broad read access across the system for monitoring purposes, no ability to create/edit/delete data, no outside-call authority beyond the same approval gates a human would need.
- No new permissions introduced by this document.

## Dependencies

- Builds on `AI_Architecture.md` (background/scheduled design), `AI_Permissions.md` (Guardian's role and access model), `Advisor.md` (handoff channel), `Security_Architecture.md` (logging requirements), and `File_Connector_Architecture.md` (sync status monitoring).
- Feeds into `06_Admin/Monitoring.md` and `06_Admin/Admin_Dashboard.md`, where the passive and urgent notification feeds will be designed in full screen/UX detail.

## Future Enhancements

- Email and/or text delivery for urgent alerts, in the commercial version.
- Reassessment of monitoring frequency (more frequent or event-driven) for the commercial version, especially for urgent categories.
- Opt-in, higher-depth family monitoring levels for parents (moving beyond fact-only observations) — explicitly a future, selectable setting, not a default behavior, and to be designed as part of a future Parental Controls module rather than expanded here.
- Expansion of the system health/security/family-pattern starter lists as real usage reveals gaps.

## Questions

None currently open.
