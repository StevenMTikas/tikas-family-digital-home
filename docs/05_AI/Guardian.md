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

**Safety Signal (a deliberate, narrow exception to "fact-level only," built 2026-08-01)**
- Guardian also scans recent Assistant conversation content (messages since its last run) for a small, explicit, hand-picked set of keyword/phrase buckets — currently self-harm, abuse, and danger — and produces a finding when one matches.
- This *is* content-aware, which the Family-Pattern Health rule above otherwise rules out for MVP — a deliberate exception the Super Admin directed be built (2026-08-01), not a quiet expansion of Guardian's general scope. It's narrow by design: a small, fixed phrase list chosen to bias toward missing a real concern over over-flagging ordinary conversation, and it's a scheduled fact-check (once a day, same as everything else Guardian does), not real-time surveillance.
- The finding text states only that a category matched (e.g., "...language that may relate to self-harm...") — it never quotes the actual private message, so a household member's exact words aren't exposed even to whoever receives the alert; the point is "go check in personally," not "read what they said."
- Notifies the Super Admin always, plus any Admin who is both scoped to that person (`admin_scope`) and individually holds **"View Child Activity Logs"** — the same permission `AI_Memory.md` now reuses for viewing a scoped child's AI_Memory profile. An Admin without that permission never sees it, even if scoped to the person.
- Not routed through Advisor or the passive channel — it's its own channel (below), always `urgent` severity.

This starter list is expected to expand as real usage reveals what's actually worth watching.

### Schedule

- **MVP: runs once per day**, on a schedule (per `AI_Architecture.md`'s "background, scheduled" design).
- **Commercial version:** frequency needs closer evaluation — likely more frequent or event-driven for urgent categories (e.g., disk space, backup failure) — noted as a future item, not decided here.

### Four Output Channels

Guardian's findings route to one of four places, depending on severity:

| Channel | Used For | MVP Delivery | Commercial Delivery (Future) |
|---|---|---|---|
| **Passive Admin Dashboard notification** | Lower-priority findings, awareness-only (e.g., a blocked outside-call attempt) | Shown on Super Admin's Admin Dashboard | Same, dashboard-based |
| **Handoff to Advisor** | Findings better framed as an actionable suggestion for a specific family member (per `Advisor.md`'s cross-role triggering) | Becomes an `AI_Suggestion`, shown per Advisor's display rules | Same |
| **Urgent direct alert** | Findings that genuinely can't wait — e.g., backup failure, disk nearly full | Shown as a distinct, urgent item on the Super Admin's Admin Dashboard, MVP | Sent via email and/or text, in addition to or instead of dashboard display |
| **Safety notification** (built 2026-08-01) | A Safety Signal finding (above) — a keyword match in a family member's recent Assistant conversation | Urgent notification to the Super Admin and any permitted, scoped Admin (see above) | Same, likely also email/text alongside urgent alerts |

Guardian itself decides which channel a given finding belongs in, based on severity — this classification logic lives in Guardian's own reasoning, not a fixed static table, though the categories above (system health issues affecting availability = likely urgent; routine security awareness = passive; family usage patterns = Advisor handoff; a safety keyword match = safety) are the starting guide.

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
- Classifies each finding into one of the four output channels based on severity.
- For family-pattern observations, stays strictly at the fact level for MVP — no interpretation, judgment, or inferred cause. The Safety Signal check (above) is the one deliberate, narrow, explicitly-directed exception to this — content-aware only for a small fixed keyword list, never quoting the actual message, never used for anything but that one narrow purpose.
- Can trigger an Advisor suggestion (per `Advisor.md`'s cross-role triggering) when a finding is better delivered as a recommendation to a specific person than a system-level notification.

## Permissions

- Fully governed by the Guardian role defined in `AI_Permissions.md` — broad read access across the system for monitoring purposes, no ability to create/edit/delete data, no outside-call authority beyond the same approval gates a human would need.
- **Safety notification recipients (2026-08-01):** reuses the existing "View Child Activity Logs" grantable permission (`Authorization.md`) as the gate for which Admin, if any, receives a safety notification about a specific scoped child — not a new permission of its own.

## Dependencies

- Builds on `AI_Architecture.md` (background/scheduled design), `AI_Permissions.md` (Guardian's role and access model), `Advisor.md` (handoff channel), `Security_Architecture.md` (logging requirements), and `File_Connector_Architecture.md` (sync status monitoring).
- Feeds into `06_Admin/Monitoring.md` and `06_Admin/Admin_Dashboard.md`, where the passive and urgent notification feeds will be designed in full screen/UX detail.

## Future Enhancements

- Email and/or text delivery for urgent alerts, in the commercial version.
- Reassessment of monitoring frequency (more frequent or event-driven) for the commercial version, especially for urgent categories.
- Opt-in, higher-depth family monitoring levels for parents (moving beyond fact-only observations) — explicitly a future, selectable setting, not a default behavior, and to be designed as part of a future Parental Controls module rather than expanded here.
- Expansion of the system health/security/family-pattern starter lists as real usage reveals gaps.
- **Revisit the Safety Signal check's scope for a commercial/multi-household release** — built 2026-08-01 as an always-on, non-configurable exception for this one household, on this one household's explicit direction. A real product decision is needed before other households get it too: should it be opt-in/toggle-able per household (matching the "opt-in higher-depth monitoring" principle above, which this otherwise contradicts), should the keyword list be editable, and should there be any user-facing disclosure that this scanning happens at all (there currently isn't one).

## Questions

None currently open.
