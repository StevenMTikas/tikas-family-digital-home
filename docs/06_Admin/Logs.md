# Logs

## Purpose

Defines the Logs screen — where the security events already required by `Security_Architecture.md` (logins, password resets, device changes, permission changes, outside-call approvals/denials, blocked attempts) are actually reviewable by the Super Admin. Also establishes the MVP retention window, which hadn't been decided anywhere else yet.

## Goals

- Make the extensive logging already required elsewhere in the system actually usable — a real, reviewable screen, not just data quietly accumulating in the background.
- Set an honest, bounded retention policy for MVP, while flagging that a durable, longer-term (or indefinite) retention model is a real commercial-version requirement, not an afterthought.

## User Stories

- As the Super Admin, I want to review security events — who logged in, what permissions changed, what outside-call attempts happened — in one place.
- As the Super Admin, I want to understand how long this history is kept, so I know what I can and can't look back on.

## Features

- **Full security event log**, covering everything already required by `Security_Architecture.md`:
  - Logins, logouts, and failed/locked attempts
  - Password resets
  - Device additions and revocations
  - Permission grants and changes (including "Approve Outside Calls," the sensitive-data gate, and a Document's sensitivity override)
  - Outside-call approvals and denials — who approved it, what was sent, and when
  - Blocked outside-call attempts, including the passive Super Admin notification this triggers (per `Security_Architecture.md`, `Data_Flow.md`)
  - **Data-access events (added 2026-08-25):** Password Entry reveals, Document uploads/downloads/deletions, Family Knowledge Item deletions, backup failures, and what an External Viewer accessed (one entry per Photos/Family Board page visit, not per item) — closing a gap where admin actions were well-audited but sensitive reads and deletions were not.
- **30-day retention window for MVP.** Log entries older than 30 days are purged automatically. This is an explicit MVP limitation — a commercial version would need a longer or indefinite retention model (see Future Enhancements), but for now, security history beyond 30 days isn't available.
- **Filterable by event type and user.** Given the range of event types logged, the screen should let the Super Admin filter (e.g., "show me only permission changes," "show me only Malachi's activity") rather than scrolling one long undifferentiated list.

## Screen Layout

- **Filter controls:** by event type (login, permission change, device change, outside-call, blocked attempt) and by user.
- **Log list:** chronological, most recent first, each entry showing event type, user involved, timestamp, and relevant detail (e.g., which permission changed, what was approved/denied).
- **Retention notice:** a visible note indicating the 30-day window, so the Super Admin isn't surprised when older entries aren't there.

## Data Stored

- No new entity — this screen displays the security event records already required by `Security_Architecture.md`'s logging rules, generated through the shared logging service (`/lib/core/logging`, per `Application_Architecture.md`).
- **New retention rule:** entries are automatically purged after 30 days for MVP. This should be reflected as an implementation detail of the logging service itself (a scheduled cleanup), not a new user-facing entity.

## AI Responsibilities

- None — this is a pure admin review screen. Guardian's own use of security events for monitoring (per `Guardian.md`) draws from the same underlying log data but isn't affected by this screen's display/filtering.

## Permissions

- **Super Admin only.** Consistent with `Administration.md`'s existing rule that technical/system-wide logs are not part of a scoped Admin's reduced view — Vee's access to Malachi-specific activity (per `view_child_activity_logs`, `Authorization.md`) is a separate, narrower capability from this full security log.

## Dependencies

- Builds on `Security_Architecture.md` (the full list of required logged events), `Application_Architecture.md` (the shared logging service), `Data_Flow.md` (the blocked-attempt notification scenario), and `Administration.md` (access model).

## Future Enhancements

- **Longer or indefinite retention** for a commercial version — the 30-day window is an explicit MVP-only limitation, not a permanent design decision.
- Export/download of log history, if useful for record-keeping beyond the retention window.

## Questions

None currently open.
