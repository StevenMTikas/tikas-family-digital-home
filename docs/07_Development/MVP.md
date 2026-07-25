# MVP

## Purpose

Defines what "MVP" actually means for Tikas Family Digital Home — consolidating the many individual "for MVP" vs. "future/commercial" decisions already made throughout every other document into one clear scope statement, plus what "done" looks like. This document doesn't introduce new decisions; it collects ones already made so scope is never ambiguous.

## Goals

- Make MVP scope unambiguous by pulling every already-decided in/out boundary into one place.
- Define what "MVP complete" actually means, tied to `Milestones.md`'s Phase 8 (household dogfooding).
- Give a fast way to check "is this in scope?" without re-reading every individual module doc.

## User Stories

- As the developer, I want one place to check whether something is in MVP scope before spending time building it.
- As the Super Admin, I want a clear sense of what the household will actually be able to use once MVP is complete.

## Features

### Who It's For

MVP is built for **one household**: Dad (Super Admin), Vee (scoped Admin over Malachi), and Malachi (Basic User, 15) — 3 computers, 3 phones, all Android (per `System_Overview.md`). It is explicitly **not** yet built for other families or a commercial audience; several MVP decisions (technical admin tools, simplified encryption, Android-only) are acceptable specifically because of this narrow scope.

### In Scope for MVP

- **Infrastructure:** self-hosted on Dad's desktop (host), local Ollama AI, SQLite, connectors syncing once daily with no retry (`Technology_Stack.md`, `System_Overview.md`, `File_Connector_Architecture.md`).
- **Identity & permissions:** username/password auth, device-gated login, full role/scope/permission model, folder permissions with nesting and inheritance (`Authentication.md`, `Authorization.md`, `Folder_Permissions.md`).
- **Content modules, at their MVP feature level:**
  - Calendar: one-off events only, weekly view only, public/private visibility (`Calendar.md`)
  - Tasks: flat structure (no priority/categories), parent-to-child assignment only (`Tasks.md`)
  - Documents: download-only, no versioning, AI-prompted categorization (`Documents.md`)
  - Photos: AI-prompted tagging, no dedup (`Photos.md`)
  - Memory: text/photo/document combinations, no dedup (`Memory.md`)
  - Family Knowledge: general items plus structured Password Entries, MVP-level encryption (`Family_Knowledge.md`)
- **AI layer:** Assistant, Advisor, Guardian, AI_Memory, AI_Suggestions — all suggest-only, no autonomous action (`AI_Permissions.md`); Guardian's family-pattern monitoring stays fact-only, not judgment-based (`Guardian.md`).
- **Security:** outside-call approval flow, sensitive-data gate (unavailable to minors), Standing Integration Connections for Email and Weather (`Security_Architecture.md`, `AI_Permissions.md`, `Email.md`, `Dashboard.md`).
- **Admin & monitoring:** full technical admin suite (backups, logs, monitoring) — explicitly MVP-only, not part of a future commercial admin experience (`Administration.md`, `Monitoring.md`, `Logs.md`, `Backup.md`).
  - 30-day log retention (`Logs.md`)
  - Daily-snapshot-only monitoring, no live refresh (`Monitoring.md`)
  - 7-day rolling local backup retention (`Backup.md`)
- **Notifications:** real-time only, capped at last 10, severity-styled, Android push (`Notifications.md`)
- **Search:** Documents, Photos, and Family Knowledge only, dedicated search screen (`Search.md`)
- **Voice:** tap-to-talk only, local speech-to-text and text-to-speech, Assistant-scoped only (`Voice.md`)
- **Email:** one account per user, read-only summary, local classification (`Email.md`)
- **Design & accessibility:** light mode only, WCAG 2.1 AA baseline on both desktop and mobile (`Design_Language.md`, `Accessibility.md`)
- **Onboarding:** no guided walkthrough — existing screens used in sequence (`Onboarding.md`)

### Explicitly Out of Scope for MVP

Everything below is deliberately deferred, not forgotten — each is already logged in its source document's Future Enhancements and consolidated in `Future_Ideas.md`:

- Recurring events/tasks, day/month calendar views, sub-tasks, priorities/categories for Tasks
- Document preview (in-app) and versioning
- Duplicate detection for Photos/Memory
- Dark mode, wake-word voice activation, app-wide voice (beyond Assistant)
- Multiple email accounts per user, AI-suggested actions from email content
- Live/on-demand system monitoring, longer/indefinite log retention, cloud backup
- Stronger dedicated encryption for Password Entries
- Guided onboarding walkthrough
- Guardian autonomous action (beyond suggestions), expanded/opt-in parental monitoring depth
- CAD/STL file support, additional Standing Integration Connections beyond Email/Weather
- Non-Android push notification support (iOS)

### Definition of Done

MVP is considered complete when:
1. All modules listed under "In Scope" are built per their respective documents and pass the testing approach defined in `Testing.md` (core services first, security-critical paths disproportionately covered).
2. `Milestones.md`'s Phases 0–7 are complete.
3. The household (Dad, Vee, Malachi) is using the app daily for real calendar, task, and content management — `Milestones.md`'s Phase 8, household dogfooding — with no critical permission or security gaps found in that real-world use.
4. Issues found during dogfooding have been triaged: real bugs fixed, genuine scope gaps logged to `Future_Ideas.md` rather than silently expanding MVP scope mid-stream.

## Screen Layout

- Not applicable — this is a scope-definition document.

## Data Stored

- None.

## AI Responsibilities

- None directly — this document defines AI feature scope, not new AI behavior.

## Permissions

- None.

## Dependencies

- Consolidates and depends on nearly every document produced across this project; should be treated as the authoritative scope reference, updated if any individual document's in/out-of-scope decision changes.

## Future Enhancements

- Everything under "Explicitly Out of Scope for MVP" above, in the priority order `Milestones.md`'s future phases would eventually address, once a commercial or expanded release is actually being planned.

## Questions

None currently open.
