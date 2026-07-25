# AI

## Purpose

Defines the AI module — the user-facing settings screen that ties together the AI features already defined in `05_AI` (Assistant, Advisor, AI_Memory, AI_Suggestions) into one place a family member can view and control. This document does not redefine agent behavior — that lives in `05_AI` — it defines the **screen** where a user manages their own AI experience.

## Goals

- Give each family member one place to see and manage everything related to their AI experience, rather than scattering controls across modules.
- Add the one genuinely new capability this module introduces — a simple, per-user AI on/off switch — without overcomplicating MVP with granular controls that aren't needed yet.
- Keep Standing Integration Connections (Weather, Email) in their own modules for MVP, while flagging this as worth revisiting once real usage shows where they're best managed long-term.

## User Stories

- As a family member, I want one screen where I can see my conversation history, what the AI remembers about me, and review past suggestions.
- As a family member, I want a simple way to turn the AI off for myself if I don't want to use it.
- As the Super Admin, I want a natural home for AI-related settings that will make sense to expand as the system grows.

## Features

- **AI Settings hub.** A single screen bringing together:
  - A link to **conversation history** (per `Assistant.md`'s chat sidebar).
  - A link to **"What the AI Knows About Me"** (per `AI_Memory.md`'s view of AI_Memory entries, including the ability to flag an entry).
  - A view of **past suggestions and feedback** (per `AI_Suggestions.md`), for a user to look back at what they've accepted, dismissed, or thumbs-downed.
- **Simple AI on/off toggle.** A single, straightforward switch per user: AI on (default) or off. When off for a given user:
  - The Assistant is not available to that user.
  - No new Advisor suggestions are generated for that user.
  - Guardian's household-level, system-health monitoring is unaffected — this toggle is a personal AI-experience preference, not a way to disable system-wide monitoring (which isn't user-controllable per `Guardian.md`'s existing role model).
- **No granular controls for MVP.** No per-module suggestion frequency tuning, no opting out of just one AI role — the on/off toggle is intentionally simple for now (see Future Enhancements).
- **Standing Integration Connections stay in their own modules for MVP.** Weather (`Dashboard.md`) and Email (`Email.md`) are not managed from this screen yet — worth revisiting as a possible unified "Connected Services" view once real usage shows whether that's genuinely more useful than managing them where they naturally live.

## Screen Layout

- **AI Settings screen**, reachable from the user's own profile/settings area (alongside `Users.md`'s "My Profile"):
  - AI on/off toggle, prominent at the top.
  - Section links to Conversation History, AI Memory, and Suggestion History.
  - No connected-services list for MVP (see Features above).

## Data Stored

Extends the existing **User** entity (`Data_Model.md`) with:

| Field | Notes |
|---|---|
| ai_enabled | boolean, true by default — the per-user AI on/off toggle defined in this module |

No other new entities — this module surfaces existing Conversation, Message, AI_Memory, and AI_Suggestion records (per `Assistant.md`, `AI_Memory.md`, `AI_Suggestions.md`) rather than introducing new ones.

## AI Responsibilities

- The Assistant, Advisor (and any suggestion generation targeting a specific user) check `ai_enabled` before acting on that user's behalf.
- Guardian's own household-level monitoring role (`AI_Permissions.md`, `Guardian.md`) is unaffected by any individual user's `ai_enabled` setting — it isn't a user-facing toggle for Guardian's system responsibilities.

## Permissions

- Every user can view and toggle their own `ai_enabled` setting — no special permission required.
- A user cannot toggle AI on/off for another family member; that remains a personal setting, not an admin-controlled one, for MVP.

## Dependencies

- Builds on `Assistant.md`, `AI_Memory.md`, `AI_Suggestions.md`, `Guardian.md`, and `Data_Model.md` (User entity, plus the new `ai_enabled` field).
- Related to but does not currently manage `Dashboard.md`'s weather connection or `Email.md`'s email connection.

## Future Enhancements

- Granular controls (e.g., per-module suggestion frequency, opting out of just Advisor while keeping Assistant) if the simple on/off proves too blunt in practice.
- A possible unified "Connected Services" view consolidating Standing Integration Connections (Weather, Email, and any future integrations) into this screen, once usage patterns clarify whether that's actually more useful than managing them in their own modules.

## Questions

None currently open.
