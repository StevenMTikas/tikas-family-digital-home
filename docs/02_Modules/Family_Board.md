# Family Board

## Purpose

A standalone, persistent bulletin board for the whole family — distinct from the Dashboard's Family Message Board (`Dashboard.md`), which lives embedded in the family-wide Dashboard view. The Family Board is its own module specifically so it has a 1:1 read-only counterpart on the External Viewer surface (`app/family-view/board`), letting relatives outside the household see the same posts without joining the household's Tailscale network. See `Authorization.md`'s External Viewer role.

## Goals

- Give the household a simple, always-there place to post announcements, without the AI/suggestion clutter of the Dashboard.
- Reuse the Family Message Board's already-proven, minimal permission shape rather than inventing new rules — same read/post/edit/delete semantics, deliberately.
- Make the read side cleanly shareable with an External Viewer account, which the Dashboard-embedded Family Message Board isn't designed to be.

## User Stories

- As an Admin or Super Admin, I want to post something for the whole family (and, if I choose, an outside relative) to see.
- As any family member, I want to read the board without needing any special permission.
- As the person who posted something, I want to be able to edit or delete my own post.
- As the Super Admin, I want a moderation backstop to delete any post if needed.
- As a Super Admin, I want to let a specific External Viewer (e.g. a grandparent) read the board, without giving them post/edit/delete rights.

## Features

- **Standalone module**, reachable from the main nav shell (`NavShell`) as its own destination, not folded into Dashboard.
- **Anyone in the household can read**, no permission gate.
- **Posting requires Admin or Super Admin** — a Basic User can read but not post, same rule as the Family Message Board.
- **Editing is poster-only** — nobody else, not even the Super Admin, can change the wording of someone else's post.
- **Deleting is poster-or-Super-Admin**, as a moderation backstop.
- **External Viewer read access** is off by default, gated by the `View Family Board` individually grantable permission (`Authorization.md`) — a single boolean per account, not a folder grant, since there's only one board. Toggled from Administration's External Viewers tab. An External Viewer can never post, edit, or delete.

## Screen Layout

- **Internal (`/board`):** composer (Admin/Super Admin only) at top, then a reverse-chronological list of posts — poster name, timestamp, "(edited)" tag if changed, Edit shown only to the poster, Delete shown to the poster or Super Admin. Same visual pattern as the Dashboard's Family Message Board section.
- **External (`/family-view/board`):** the same post list, read-only — no composer, no Edit/Delete controls, regardless of who posted.

## Data Stored

New **Family_Board_Post** entity (2026-08): `id`, `text`, `posted_by`, `created_at`, `updated_at` — see `db/schema.sql`'s `family_board_posts` table. Deliberately the same minimal shape as `Family_Message` (`Dashboard.md`), not a coincidence — this module is modeled directly on that one.

## AI Responsibilities

None — like the Family Message Board, this is a plain human-to-family (and, when granted, human-to-external-viewer) channel with no AI involvement.

## Permissions

- **Read:** any internal role, unconditionally. An External Viewer only if granted `View Family Board` (`Authorization.md`).
- **Post:** Admin or Super Admin only.
- **Edit:** the original poster only.
- **Delete:** the poster, or the Super Admin as a moderation backstop.
- See `app/api/family-board/access.ts` for the exact predicates the API enforces.

## Dependencies

- Modeled directly on `Dashboard.md`'s Family Message Board section — same rules, deliberately duplicated rather than shared, since the two serve different placements (Dashboard-embedded vs. standalone with an external counterpart).
- Feeds the External Viewer surface (`Security_Architecture.md`'s section on `/family-view`) via the shared `GET /api/family-board` endpoint and the `View Family Board` grantable permission (`Authorization.md`).

## Future Enhancements

- Consider whether the Dashboard's Family Message Board and this module should eventually be unified now that both exist with near-identical rules — not attempted in the initial build to avoid conflating two different placements/audiences.

## Questions

None currently open.
