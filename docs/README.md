# Tikas Family Digital Home

A self-hosted, local-first system designed to help one family organize their lives, protect their knowledge, and simplify daily routines — without handing their data to a third party. Built around a single core belief: technology should reduce the complexity of family life, not add to it. See `00_Project_Foundation/Vision.md` for the full statement.

This repository is the complete design and planning documentation for the project — written before a single line of application code, so that building can proceed from a real specification rather than improvisation.

## How to Use This Documentation

Every document (with the exception of this README) follows the same structure: **Purpose → Goals → User Stories → Features → Screen Layout → Data Stored → AI Responsibilities → Permissions → Dependencies → Future Enhancements → Questions.** This means you always know where to look for a given kind of information, regardless of which document you're in.

If you're new to this project, read in this order:

1. **`00_Project_Foundation/`** — start here. Vision, Mission, Core Principles, and Family Rules establish *why* this project exists and what it will never compromise on.
2. **`01_System_Architecture/`** — the technical foundation: stack, system overview, security, data model, application architecture, AI architecture, connectors, data flow, and API conventions.
3. **`02_Modules/`** — what the app actually does, module by module (Dashboard, Calendar, Tasks, Documents, Photos, Memory, Family Knowledge, Email, Voice, AI, Notifications, Search, Administration, Users).
4. **`03_User_Experience/`** — how it looks and feels: navigation, layout, design language, user flows, onboarding, accessibility.
5. **`04_Permissions/`** — the full permission model: authentication, authorization, folder permissions, AI permissions.
6. **`05_AI/`** — the AI roles in depth: Assistant, Advisor, Guardian, Morning Briefing, AI Memory, AI Suggestions, Conversation Rules.
7. **`06_Admin/`** — the admin-facing screens: Admin Dashboard, Monitoring, Folder Management, Logs, Internet Access, Backup.
8. **`07_Development/`** — how to actually build it: MVP scope, Milestones, Coding Standards, Testing.

`Cursor_Project_Rules.md` (in `00_Project_Foundation`) is the "constitution" — it should be loaded into any coding assistant's context (e.g., as a `CLAUDE.md`) before writing any application code.

## Two Documents Worth Knowing About Specifically

- **`07_Development/Future_Ideas.md`** — a running, living collection of every feature and enhancement explicitly deferred out of MVP scope, consolidated from every other document's own "Future Enhancements" section. Check here before assuming something was forgotten rather than deliberately deferred.
- **`01_System_Architecture/Decision_Log.md`** — a lightweight record of significant technical decisions and the reasoning behind them (e.g., why SQLite over Postgres, why local AI over cloud), so the reasoning isn't lost months later.

## Current Status

This documentation set is nearly complete. The only outstanding document is `00_Project_Foundation/Family_Rules.md` — deliberately saved for last, since it's the one document that's genuinely about this family's own values rather than something derivable from established patterns elsewhere. `07_Development/MVP.md` is the authoritative statement of what's in and out of scope for the first buildable version; `07_Development/Milestones.md` sequences the build order.

This is a living documentation set — expected to be updated as real development and real household usage (per `Milestones.md`'s Phase 8) reveal gaps, edge cases, or better approaches than what's specified here. When a document changes, check its **Dependencies** section for what else might need updating alongside it.
