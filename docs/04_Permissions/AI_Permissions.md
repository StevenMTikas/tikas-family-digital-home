# AI Permissions

## Purpose

Defines what each AI agent (Assistant, Advisor, Guardian) is allowed to see and do, including Guardian's unique scope as a background agent with no requesting user, whether any agent can act autonomously vs. suggest-only, AI_Memory visibility, and the extra gate required before sensitive data can be sent outside the home. This document is the AI-specific companion to `Authorization.md` and `Folder_Permissions.md`.

## Goals

- Give Guardian a permission model broad enough to genuinely monitor family health, without granting it Super Admin-level authority.
- Keep every AI agent suggest-only for MVP, consistent with "the dashboard should learn slowly."
- Add a dedicated, extra gate for sensitive data leaving the home — separate from general outside-call approval — and make it categorically unavailable to a minor's account, not just off by default.

## User Stories

- As a family member, I want the Guardian to watch over the household's overall health without being able to see or touch anything it doesn't need to.
- As the Super Admin, I want the AI to only ever suggest actions for MVP, so nothing changes in the system without a human deciding to make it happen.
- As a family member, I want to see what the AI has learned about me, even if I can't edit it directly.
- As a parent, I want an extra layer of protection before sensitive information can leave the home — and I want that extra layer to be something Malachi's account simply cannot grant itself, no matter what.

## Features

### Guardian's Own Role

Guardian is not tied to a requesting user the way Assistant and Advisor are — it runs on its own schedule (per `AI_Architecture.md`). It operates under its **own dedicated role**, distinct from Super Admin, Admin, and Basic User:

| Capability | Guardian |
|---|---|
| Read/view across all users' data, for monitoring purposes | Yes — broad, system-wide read access, since family health can't be assessed one user at a time |
| Create, edit, or delete any data | No — suggest-only, same as every other agent (see below) |
| Manage users, permissions, devices, or folder access | No |
| Reset passwords | No |
| Access technical admin tools (backups, logs, monitoring) | Yes — this is core to Guardian's monitoring purpose |
| Send anything outside the home | Only through the exact same approval gates a human would need — Guardian has no standing outside-call authority of its own |

Guardian's broad read access exists specifically to support monitoring and suggestion generation — it is not a backdoor around folder or content permissions for any other purpose, and it carries no authority to act, change, or transmit anything on its own.

### Suggest-Only for MVP

- **No AI agent — Assistant, Advisor, or Guardian — can create, edit, or delete data on its own for MVP.** Every action requires a human to review and take it.
- This is a deliberate MVP constraint, consistent with "the dashboard should learn slowly" (`Core_Principles.md`).
- **Future consideration:** Guardian specifically may be given some autonomous authority later (e.g., auto-creating a task from a detected pattern), once trust in its suggestions is established. Not built for MVP — noted in Future Enhancements.

### AI_Memory Visibility

- Resolves the open question from `AI_Architecture.md`: **a user can view what the AI has stored about them in AI_Memory, but cannot edit it.**
- **Only the Super Admin can edit or correct AI_Memory entries** — for any user, including their own.
- This applies uniformly across roles — a Basic User, a scoped Admin, and even the Super Admin themselves can only *view* their own AI_Memory day-to-day; editing requires the Super Admin acting in that specific capacity.

### Sensitive Data Outside-Transmission Gate

A second, additional gate — separate from the general **"Approve Outside Calls"** permission (`Authorization.md`) — applies specifically when the data involved is flagged as **sensitive** (e.g., financial documents, medical records; specific categories to be defined further in `Documents.md`/`Family_Knowledge.md`):

- **For MVP, this requires explicit user approval**, same "show exactly what's being sent" pattern as general outside-call approval (per `Security_Architecture.md`).
- **This permission is categorically unavailable to a minor's account.** Unlike "Approve Outside Calls" (which is merely off-by-default for a child but technically grantable), this permission **cannot be granted to a minor at all** — there is no admin action that turns it on for Malachi's account.
- This gate applies **only** to sending sensitive data outside the home. It does not restrict a user's normal ability to view, ask about, or receive AI suggestions involving sensitive data they already have folder access to — per your direction, every user should still get full AI help (answers, suggestions) using data they're permitted to see; the extra gate is specifically about that data leaving the home.
- **Photo-to-event extraction is treated as sensitive by default**, without needing an explicit `is_sensitive` flag on the underlying content (per `Assistant.md`). Any photo sent to an outside frontier model for extraction automatically requires the sensitive-data gate, not just general outside-call approval — meaning this specific capability is unavailable to a minor's account, consistent with the gate's existing rule.

## Screen Layout

- AI_Memory is viewable from each user's own profile/settings screen; editing controls are only visible/functional when the Super Admin is acting.
- The sensitive-data approval prompt follows the same visual pattern as the general outside-call approval prompt (showing exactly what's being sent), with a distinct label making clear this is the sensitive-data gate specifically.
- Guardian's activity (what it's monitored, what it's suggested) is visible through the Admin Dashboard's monitoring view, not through a user-facing chat interface the way Assistant is.

## Data Stored

- Extends **Document** and **Family_Knowledge_Item** (`Data_Model.md`) with an `is_sensitive` flag, used to determine whether the extra outside-transmission gate applies.
- Extends the **User** entity (`Data_Model.md`, `Authorization.md`) with a new individually grantable permission:

| Field | Notes |
|---|---|
| approve_sensitive_outside_transmission | boolean permission, off by default for all adults; cannot be set to true for any user flagged as a minor — enforced at the system level, not just a UI default |

- No new fields needed for AI_Memory beyond what's already defined in `AI_Architecture.md` — visibility/edit rules here are enforced through permission checks, not schema changes.

## AI Responsibilities

- Every agent enforces its own scope described above before acting: Assistant/Advisor scoped to the requesting user's permissions; Guardian operating under its own broad-but-limited role.
- Every agent checks for the sensitive-data flag before including such content in any outside-bound request, and requires the additional gate above general outside-call approval.
- No agent bypasses suggest-only behavior for MVP, regardless of how confident it is in a proposed action.

## Permissions

- This document defines two new permission concepts layered onto `Authorization.md`'s existing model: **Guardian's dedicated role**, and the **sensitive-data outside-transmission gate**.
- Both are checked fresh on every relevant request via `/lib/core/permissions` and `/lib/core/ai`, consistent with the rest of the system (`Application_Architecture.md`).

## Dependencies

- Builds on `AI_Architecture.md` (agent design, AI_Memory), `Authorization.md` (permission model), `Security_Architecture.md` (outside-call approval pattern), and `Data_Model.md`.
- Feeds into `05_AI/Guardian.md`, `05_AI/AI_Memory.md`, `Documents.md`, and `Family_Knowledge.md` (where sensitive-category definitions will be fleshed out).

## Future Enhancements

- Evaluate giving Guardian limited autonomous authority (not just suggestions) once its suggestion accuracy/trust is established post-MVP.
- Expand the definition of "sensitive" data categories as real usage clarifies what actually needs the extra gate.

## Questions

None currently open.
