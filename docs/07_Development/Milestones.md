# Milestones

## Purpose

Sequences the build order for Tikas Family Digital Home's MVP into logical phases, based on dependencies already established across the architecture and module documentation — foundational pieces first, then modules in an order that avoids building on undefined ground. No target dates are set here, since none have been discussed; phases are ordered by dependency, not calendar time.

## Goals

- Build in an order where nothing depends on something that doesn't exist yet — e.g., Calendar shouldn't be built before Authorization, since Calendar's edit rights depend on role checks.
- Get to a genuinely usable, testable slice of the app as early as possible, rather than building every module in isolation before anything is usable together.
- Keep each milestone's scope traceable to specific documents already written, so "what does this phase include" is never ambiguous.

## User Stories

- As the developer, I want a build order that won't force me to backtrack because I built something before its dependency existed.
- As the developer, I want to reach a usable version of the app as early as reasonably possible, to start dogfooding with the real household.

## Features (Milestone Phases)

### Phase 0 — Foundation
- Project scaffold: Next.js (App Router), TypeScript, Tailwind, SQLite, folder structure per `Application_Architecture.md`.
- `CLAUDE.md` populated from `Cursor_Project_Rules.md` (per the earlier Claude Code discussion).
- Ollama installed and running locally, initial model selected per `AI_Architecture.md` (Llama vs. Qwen — open decision, see `Decision_Log.md`).
- Core shared services scaffolded (empty but structured): `/lib/core/permissions`, `/lib/core/ai`, `/lib/core/logging`, per `Application_Architecture.md`.

### Phase 1 — Identity & Permissions
- **Authentication** (`Authentication.md`): username/password login, device-gated access, trusted-device session persistence.
- **Authorization** (`Authorization.md`): roles, admin scope, individually grantable permissions.
- **Folder Permissions** (`Folder_Permissions.md`): nesting, inheritance, View/Edit/Delete model, shared family folder.
- **Users module** (`Users.md`): profile self-editing, Add User flow, family visibility, device view.
- This phase is the foundation everything else checks against — no module beyond this point can be meaningfully tested without it.

### Phase 2 — Core Content Modules
- **Calendar** (`Calendar.md`), **Tasks** (`Tasks.md`) — the two most immediately useful, dependency-light modules.
- **Documents** (`Documents.md`), **Photos** (`Photos.md`) — introduce folder-scoped content and AI-prompted metadata.
- **Memory** (`Memory.md`), **Family Knowledge** (`Family_Knowledge.md`) — build on patterns established by the above.
- At the end of this phase, the household has a genuinely usable app for calendar, tasks, and content — even before any AI is wired in.

### Phase 3 — AI Layer
- **AI Architecture** (`AI_Architecture.md`): the central AI service, hybrid memory (AI_Memory), shared prompt structure.
- **Assistant** (`Assistant.md`): persistent chat, conversation history.
- **Advisor** (`Advisor.md`) and **AI_Suggestions** (`AI_Suggestions.md`): suggestion generation, display, feedback lifecycle.
- **Guardian** (`Guardian.md`): background monitoring, starts with the system-health portion since Phase 4 will need it.
- **AI module/settings** (`AI.md`): the user-facing AI on/off toggle and settings hub.
- **AI Permissions** (`AI_Permissions.md`): sensitive-data gate, outside-call approval enforcement — implemented alongside the AI layer, not bolted on after.

### Phase 4 — Admin & Security Surface
- **Administration hub** (`Administration.md`), **Admin Dashboard** (`Admin_Dashboard.md`).
- **Monitoring** (`Monitoring.md`) — now meaningful, since Guardian's system-health checks exist from Phase 3.
- **Logs** (`Logs.md`), **Folder Management** (`Folder_Management.md`), **Internet Access** (`Internet_Access.md`), **Backup** (`Backup.md`).

### Phase 5 — Connectors & Devices
- **File Connector Architecture** (`File_Connector_Architecture.md`) implemented on the other two computers and three phones.
- Device trust/pairing flow exercised for real, beyond the host.

### Phase 6 — Extended Integrations
- **Notifications** (`Notifications.md`) — real-time delivery, severity styling, capped recent list.
- **Search** (`Search.md`) — cross-content vector search.
- **Voice** (`Voice.md`) — tap-to-talk input, local text-to-speech.
- **Email** (`Email.md`) — Standing Integration Connection, unread/important summary.
- **Dashboard** (`Dashboard.md`), **Morning Briefing** (`Morning_Briefing.md`) — now meaningful once Phases 2–6 provide real content to summarize.

### Phase 7 — Polish & Validation
- Apply **Design Language** (`Design_Language.md`) and **Dashboard Layout** (`Dashboard_Layout.md`) across all screens built in prior phases.
- **Navigation** (`Navigation.md`) finalized once all modules exist to navigate between.
- **Accessibility** (`Accessibility.md`) pass — contrast audit, keyboard/screen-reader support.
- **Testing** (`Testing.md`) — core service test coverage should already exist from earlier phases; this is the pass for module-level and manual flow testing.
- **Onboarding** (`Onboarding.md`) — Super Admin setup sequence and first-login flow exercised end to end.

### Phase 8 — Household Dogfooding
- Real, daily use by Dad, Vee, and Malachi — the actual MVP validation. Issues found here feed back into `Future_Ideas.md` and, where they affect scope, back into the relevant module doc.

## Screen Layout

- Not applicable — this is a project-planning document.

## Data Stored

- None.

## AI Responsibilities

- None directly — this document sequences when AI features get built, not how they behave.

## Permissions

- None.

## Dependencies

- Sequences nearly every document produced so far; should be read alongside `MVP.md` once written, since that document defines what "done" means for each phase's scope.

## Future Enhancements

- Add target dates once there's a real sense of available development time per phase.
- Revisit phase ordering if development reveals a dependency that wasn't apparent from the documentation alone.

## Questions

None currently open.
