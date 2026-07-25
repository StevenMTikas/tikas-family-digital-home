# Tikas Family Digital Home — Claude Code Instructions

This file is read automatically by Claude Code at the start of every session. It is derived directly from `docs/00_Project_Foundation/Cursor_Project_Rules.md` — that document remains the canonical source; if the two ever disagree, treat `Cursor_Project_Rules.md` as authoritative and update this file to match.

## Before doing anything else

This project has a complete design and planning specification in `docs/`, organized by section (see `docs/README.md` for the full index). **Read the relevant doc before implementing any feature.** Every module doc follows the same structure: Purpose → Goals → User Stories → Features → Screen Layout → Data Stored → AI Responsibilities → Permissions → Dependencies → Future Enhancements → Questions. If a doc's "Questions" section has an open item relevant to what you're building, surface it — don't silently pick an answer.

Start here if you're unfamiliar with the project:
- `docs/00_Project_Foundation/Vision.md`, `Mission.md`, `Core_Principles.md` — why this exists
- `docs/01_System_Architecture/System_Overview.md` — what the system is
- `docs/01_System_Architecture/Data_Model.md` — the entities everything else references (also implemented in `db/schema.sql`)
- `docs/07_Development/MVP.md` — what's actually in scope right now
- `docs/07_Development/Milestones.md` — the intended build order

## Non-negotiable rules

1. **Never bypass permissions.** Not for convenience, not for debugging.
2. **AI must always obey folder permissions.** The AI has no special access beyond what the acting user is allowed. See `docs/04_Permissions/AI_Permissions.md`.
3. **No feature should violate Family Rules.** See `docs/00_Project_Foundation/Family_Rules.md` once written.
4. **Family data never leaves the local network without explicit, per-action consent.** This includes AI calls to any hosted/cloud model. See `docs/01_System_Architecture/Security_Architecture.md` for the outside-call approval flow and the separate Standing Integration Connection model (weather, email).
5. **AI actions are always logged and explainable.** Route through `/lib/core/logging`.
6. **Offline first, internet by explicit user approval.**
7. **Every destructive action is reversible.** Deletes are soft-deletes with a recovery window by default.
8. **Fail loud, not silent.** A failed sync, AI call, or permission check surfaces to the user or admin.
9. **Remote access never exposes the home server directly to the open internet.** Standing Integration / remote access uses Tailscale or equivalent, not port-forwarding.
10. **Every screen supports voice where practical.** MVP scope for voice is Assistant-only — see `docs/02_Modules/Voice.md`.
11. **The dashboard should learn slowly.** No AI agent (Assistant, Advisor, Guardian) creates, edits, or deletes data autonomously for MVP — suggest-only. See `docs/04_Permissions/AI_Permissions.md`.
12. **Everything is modular.** A module should be understandable, testable, and removable on its own. Module folders under `app/<module>` and `app/api/<module>` are the two places a developer needs to look to understand a whole feature.
13. **Keep dependencies minimal.** Every new dependency is a liability a solo developer maintains forever.
14. **Dependencies are version-pinned.**
15. **Prioritize maintainability over cleverness.**
16. **Code should be readable by a solo developer months later.** Comments explain *why*, not *what* — see `docs/07_Development/Coding_Standards.md`.
17. **Docs before code.** No feature is implemented until its module doc exists and is current.
18. **All timestamps in UTC, displayed in family-local time.**

## Architecture at a glance

- **Stack:** Next.js (App Router) + TypeScript + Tailwind + Node, SQLite for MVP, local Ollama for AI. Full detail in `docs/01_System_Architecture/Technology_Stack.md` and `Application_Architecture.md`.
- **Structure:** Module folders under `app/<module>` and `app/api/<module>` own their own routes and business logic, but route through shared core services in `lib/core/` for cross-cutting concerns:
  - `lib/core/permissions` — the single place permission checks happen.
  - `lib/core/ai` — the central AI service (Assistant/Advisor/Guardian all route through here).
  - `lib/core/logging` — the single place security events get recorded.
  - Never duplicate permission, AI-routing, or logging logic inside a module — call these instead.
- **Connector API** (`app/api/connectors`) is deliberately separate from the main module API — do not entangle it with the frontend API surface. See `docs/01_System_Architecture/File_Connector_Architecture.md`.
- **Database:** `db/schema.sql` implements `docs/01_System_Architecture/Data_Model.md`. Run `npm run db:init` to create `db/tikas.db`. If you change the schema, update `Data_Model.md` in the same change — they must never drift apart.

## Security specifics worth internalizing

- **Two distinct outside-network models**, not one:
  - **AI-initiated outside calls** (e.g., photo-to-event extraction via a frontier model) require the "Approve Outside Calls" permission and show the user exactly what's being sent before it goes anywhere. Off by default for everyone; off by default for a minor as a standing rule.
  - **Standing Integration Connections** (Weather, Email) are user-initiated; the act of connecting is the consent — no per-instance approval prompt. See `docs/01_System_Architecture/Security_Architecture.md`.
- **Sensitive-data gate** is a second, stricter gate beyond general outside-call approval, required for content flagged `is_sensitive`. It is **never grantable to a minor's account**, full stop — not just off by default. See `docs/04_Permissions/AI_Permissions.md`.
- **Roles:** Super Admin (unconditional, one per household), Admin (scoped to specific child user(s), designed to support more than one child), Basic User (default for a new account). See `docs/04_Permissions/Authorization.md`.

## Testing

Per `docs/07_Development/Testing.md`: prioritize `lib/core/*` (permissions, AI routing, logging) first — bugs there have the widest blast radius. Security-critical paths (folder permissions, outside-call approval, sensitive-data gate, role/scope checks) get tests written *before* the related feature is considered done, not added later. Vitest for unit/integration tests; no end-to-end browser framework for MVP — manual walkthroughs of `docs/03_User_Experience/User_Flows.md` substitute for now.

## When something isn't specified

If a module doc's "Questions" section has an open item relevant to what you're about to build, stop and surface it rather than guessing. If something genuinely isn't covered anywhere in `docs/`, say so explicitly rather than inventing a rule that contradicts the spirit of the rules above — in particular, never loosen a permission or security rule to make something easier to implement.
