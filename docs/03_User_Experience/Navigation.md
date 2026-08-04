# Navigation

## Purpose

Defines the app's overall navigation structure — top-level destinations, the mobile-first bottom tab bar (with a desktop sidebar equivalent), the profile menu, and where Administration and the Assistant fit relative to primary navigation. With 14 modules in the app, this document establishes the grouping that keeps navigation usable rather than overwhelming.

## Goals

- Keep primary navigation to a small, memorable set of destinations, grouping related modules rather than listing all 14 flatly.
- Design mobile-first (bottom tab bar), given the household is Android-first, with desktop as a sidebar version of the same structure rather than a fundamentally different layout.
- Keep account-level actions (sign out, help, admin access) out of primary navigation, living instead in a familiar profile-icon menu.

## User Stories

- As a family member, I want to get to Dashboard, Calendar, Tasks, my content, and Search without digging through menus.
- As a family member, I want a familiar profile icon in the corner for account actions, the way most apps work.
- As an admin, I want a clear way into Administration from that same profile menu, without it cluttering navigation for everyone else.
- As a family member, I want the Assistant available from anywhere, not tucked inside a specific nav destination.

## Features

- **Primary navigation, grouped:**
  - **Dashboard** (`Dashboard.md`) — includes the Morning Briefing.
  - **Calendar** (`Calendar.md`)
  - **Tasks** (`Tasks.md`)
  - **Content** — a grouped destination covering Documents, Photos, Memory, and Family Knowledge (`Documents.md`, `Photos.md`, `Memory.md`, `Family_Knowledge.md`), rather than four separate top-level items.
  - **Family Board** (`Family_Board.md`) — added 2026-08 alongside the external_viewer feature, after this document's original 5-item list was written; not folded back into the list above until now.
  - **Search** (`Search.md`)
  - **Email** (`Email.md`) — added 2026-08-02. Email was fully built and working but had no way to reach it from the main app at all (not even a menu item) — found in a codebase-wide review, since the My Profile "Add Connection" tab only covers initial account setup, not the everyday "check my email summary" path every other module already gets via this nav.
- **Mobile-first: bottom tab bar.** The primary pattern for MVP, reflecting the primary destinations above — now 7 items rather than the original 5; still within the range of what a mobile tab bar can reasonably hold, but worth watching if an 8th module ever gets added the same way. Desktop uses a sidebar reflecting the same structure — not a different information architecture, just a different presentation of the same nav.
- **Assistant stays outside primary navigation.** The persistent chat bubble (`Assistant.md`) is available from every screen regardless of which nav destination is active — it's not a tab/nav item itself.
- **Profile icon, upper right.** A circular avatar — the user's photo if set, or their initials by default (per `Users.md`'s profile photo field) — opens a dropdown menu with:
  - My Profile (`Users.md`)
  - AI Settings (`AI.md`)
  - Help
  - **Administration** (`Administration.md`) — visible only to Admin/Super Admin roles, hidden entirely for a Basic User like Malachi.
  - Sign Out

## Screen Layout

- **Mobile:** bottom tab bar with icons for Dashboard, Calendar, Tasks, Content, Family Board, Search, Email; profile avatar in the top-right corner of the header; Assistant chat bubble floats above the tab bar, always accessible.
- **Desktop:** left sidebar with the same set of destinations; profile avatar remains top-right; Assistant chat bubble remains available regardless of sidebar selection.
- **Content section** itself uses its own sub-navigation (tabs or a menu) to move between Documents, Photos, Memory, and Family Knowledge once inside it.

## Data Stored

- No new entities — this document defines structure and uses the existing `photo` field on the User entity (`Data_Model.md`) for the profile avatar, falling back to initials derived from `full_name` when no photo is set.

## AI Responsibilities

- None — navigation is a structural/UI concern. The Assistant's placement here (persistent, outside primary nav) reflects but doesn't change anything already defined in `Assistant.md`.

## Permissions

- The **Administration** menu item only appears for users with an Admin or Super Admin role (per `Authorization.md`) — a Basic User's profile menu simply doesn't include it, consistent with `Administration.md`'s existing access model.
- All other navigation destinations are visible to every user; what they can actually do within each (e.g., folder-level permissions inside Content) is governed by the rules already established in each module's own document.

## Dependencies

- Builds on `Dashboard.md`, `Calendar.md`, `Tasks.md`, `Documents.md`, `Photos.md`, `Memory.md`, `Family_Knowledge.md`, `Family_Board.md`, `Search.md`, `Email.md`, `Assistant.md`, `Users.md`, `AI.md`, and `Administration.md` — this document is purely structural, organizing access to all of them.

## Future Enhancements

- Reconsider grouping if the "Content" umbrella feels overloaded once real usage patterns emerge — could split into separate top-level items if four modules under one tab proves cramped.
- Desktop-specific navigation enhancements (e.g., keyboard shortcuts) once the basic structure is validated.

## Questions

None currently open.
