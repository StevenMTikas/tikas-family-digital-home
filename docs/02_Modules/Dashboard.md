# Dashboard

## Purpose

Defines the Dashboard — the app's overall home screen and primary navigation hub. The Morning Briefing (`Morning_Briefing.md`) is the Dashboard's default content on open; this document covers the wider container around it: ongoing updates through the day, quick-action shortcuts, the weather widget, and the path to the family-wide view.

## Goals

- Make the Dashboard the natural "center of gravity" for the app — the place that makes everything else easy to find, without becoming cluttered.
- Keep it alive throughout the day, not just a once-a-morning snapshot.
- Add real utility (shortcuts, weather, family view access) without overwhelming the calm, background-first tone established in `Core_Principles.md`.

## User Stories

- As a family member, I want my Dashboard to update through the day, not just show me a stale morning snapshot.
- As a family member, I want quick shortcuts to common actions, so I don't have to hunt through menus for things I do often.
- As a family member, I want an easy way to jump to the family-wide view from my own Dashboard.
- As a family member, I want to glance at the weather without leaving the app.

## Features

- **Contains the Morning Briefing.** The Dashboard's default content on open is the Morning Briefing (today's events, tasks due, suggestions, notable items) — see `Morning_Briefing.md` for that content's detail.
- **Updates throughout the day.** The Dashboard isn't static after the fixed morning refresh — individual pieces update as their underlying data changes (e.g., a task marked done disappears, a new Advisor suggestion appears per its own trigger rules in `Advisor.md`).
- **Weather is a Standing Integration Connection**, not a per-instance AI outside call. Per `Security_Architecture.md`'s Standing Integration Connections model, weather is set up once (implicitly, as a system-level utility rather than something each user connects individually) and refreshes automatically without requiring "Approve Outside Calls" or a per-fetch approval prompt — the same pattern used for `Email.md`'s per-user email connections.
- **Quick-action shortcuts.** Shortcuts to common actions/destinations across the app (e.g., add event, add task, open Assistant, jump to Documents) — the Dashboard is a navigation hub, not just a read-only summary.
- **Link to the Family Dashboard.** A clear, one-tap way to move from the individual Dashboard to the shared family-wide view (per `Morning_Briefing.md`'s family-wide briefing, accessible alongside the shared family folder).
- **General principle: reduce navigation friction without adding clutter.** Anything that makes the app easier to get around belongs here in some light-touch form — but per `Core_Principles.md`'s "presence without intrusion," the Dashboard should stay calm and scannable, not become a dumping ground for every feature.

## Screen Layout

- **Top:** Morning Briefing content (today's events, tasks, suggestions, notable items — per `Morning_Briefing.md`).
- **Weather:** a small, glanceable widget, not a focal element.
- **Suggestions area:** up to 10 active `AI_Suggestion` items (per `Advisor.md`'s display limits), each with accept/dismiss/thumbs-down controls (per `AI_Suggestions.md`).
- **Quick actions:** a row or menu of shortcuts to common actions and modules.
- **Family Dashboard link:** clearly visible, not buried in a settings menu.
- Layout should stay scannable at a glance, consistent with the Morning Briefing's own "organized by section, not deep reading" approach.

## Data Stored

- No new entities beyond what's already defined — the Dashboard composes existing data: **Event**, **Task**, **AI_Suggestion** (per `Morning_Briefing.md`, `Advisor.md`).
- **Weather** is not persisted as family data — it's fetched from an external source and refreshed hourly, not stored as a lasting record. (Depending on the resolution of the open question below, a lightweight cache — e.g., last-fetched value + timestamp — may be worth adding to avoid excessive outside calls, but this isn't a new "family data" entity in the sense the rest of `Data_Model.md` covers.)

## AI Responsibilities

- No new AI role or behavior beyond what Advisor/Guardian/Assistant already do — the Dashboard is a display surface for their existing output (per `Advisor.md`, `Morning_Briefing.md`), not a new agent.
- Quick-action shortcuts may route directly into Assistant (e.g., "open Assistant" shortcut) but don't themselves involve AI reasoning.

## Permissions

- Everything shown on an individual's Dashboard is already scoped to that user's own permissions (events, tasks, suggestions) — no new permission rules introduced here.
- The Family Dashboard link only ever surfaces the shared family-wide view (per `Folder_Permissions.md`'s whole-family folder model) — it doesn't grant access to anything beyond what's already visible to all family members by default.
- Quick-action shortcuts respect the same permissions as navigating to that module directly — a shortcut doesn't bypass any permission check a normal navigation path would apply.

## Dependencies

- Builds directly on `Morning_Briefing.md` (default content), `Advisor.md` and `AI_Suggestions.md` (suggestion feed), `Folder_Permissions.md` (family folder/dashboard link), and `Data_Model.md` (Event, Task, AI_Suggestion entities).
- The weather widget relies on the Standing Integration Connection model (`Security_Architecture.md`) rather than the AI-initiated outside-call approval flow.

## Future Enhancements

- Customizable/reorderable quick actions per user, rather than a fixed set.
- Per-user weather location, if family members are ever in different places day to day.
- Additional lightweight widgets as real usage reveals what's genuinely useful here, balanced against the "don't overwhelm" principle.

## Questions

- Should quick-action shortcuts be the same fixed set for every user, or does the Super Admin (or each user) get to configure which shortcuts appear?
