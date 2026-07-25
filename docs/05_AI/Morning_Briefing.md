# Morning Briefing

## Purpose

Defines the Morning Briefing — the default view a family member sees when opening the app, summarizing what matters to them for the day. It draws together Calendar, Tasks, Advisor suggestions, and Guardian findings into one place, rather than requiring the user to check each module individually.

## Goals

- Make "opening the app" itself useful immediately, without requiring navigation to find out what matters today.
- Give each person a personalized briefing, while also providing a shared, family-wide view accessible to everyone.
- Keep tone appropriate to age without treating a mature teen like a young child — and let that tone adapt further as the AI learns the individual, not just their age.

## User Stories

- As a family member, I want to open the app and immediately see what matters for my day, without hunting through separate screens.
- As a family member, I want to see a family-wide view of everyone's day at a glance, in addition to my own personal briefing.
- As Malachi, I want the briefing to feel appropriately geared toward my age — not childish, not just an identical copy of my parents' view — and to keep adjusting to fit how I actually use it.
- As the Super Admin, I want any urgent Guardian findings to be visible right away, without me having to go looking for them.

## Features

- **Default view on open.** The Morning Briefing is the first thing a family member sees when they open the app — not a separate screen they have to navigate to.
- **Individual by default.** Each person's briefing reflects their own data — their events, their tasks, their relevant suggestions.
- **Family-wide briefing, accessible to all.** A shared view covering the whole family's day at a glance is also available, accessible from or alongside the shared family folder (per `Folder_Permissions.md`'s whole-family folder concept) — everyone can view it, not just admins.
- **Fixed time for MVP.** The briefing refreshes/is generated at a fixed daily time for MVP. Per-user configurable timing, or generating fresh on first open of the day, is a commercial-version enhancement (see Future Enhancements).
- **Age-aware, then individually-adaptive tone.** Malachi's briefing structure is the same as an adult's (same content categories), but tone starts geared toward his age, then continues to adapt to him specifically over time via AI_Memory (per `AI_Architecture.md`) — since maturity and preference vary teen to teen, not just by age bracket.

## Content (Starter List)

A typical individual Morning Briefing includes:

- **Today's calendar events** — from `Calendar`/`Event`, including anything assigned to this person (per `Event_Assignment`, `Data_Model.md`).
- **Tasks due today** — from `Tasks`, owned by this person.
- **Pending Advisor suggestions relevant to today** — pulled from active `AI_Suggestion` records (per `Advisor.md`), prioritized the same way (relevancy first, most recent as tiebreak).
- **Guardian findings worth surfacing** — anything Guardian has flagged that's relevant to this person or, for the Super Admin specifically, system-level findings (per `Guardian.md`'s three output channels — urgent items in particular should be visible here, not just on the Admin Dashboard).

The **family-wide briefing** aggregates the calendar/task view across all family members (who has what today, at a glance) rather than each person's individual suggestions or Guardian findings, which stay private to the individual per existing permission rules.

## Screen Layout

- Opens automatically as the landing view when the app is launched.
- Organized by content section (Today's Events, Tasks Due, Suggestions, Notable Items), scannable at a glance rather than requiring deep reading.
- A clear link/tab to switch from the individual briefing to the family-wide briefing, and back.
- Malachi's version uses the same layout/sections as an adult's — differences are in tone/phrasing of the content, not structure.

## Data Stored

- No new entities required — the Morning Briefing is a composed view drawing from existing entities: **Event**, **Event_Assignment**, **Task**, **AI_Suggestion**, and Guardian's findings (per `Guardian.md`).
- Tone adaptation for a given user continues to rely on **AI_Memory** (per `AI_Architecture.md`) rather than a separate briefing-specific personalization store.

## AI Responsibilities

- Assembles the briefing content by querying the relevant entities scoped to the requesting user's permissions (per `Authorization.md`, `Folder_Permissions.md`).
- Applies age-aware tone by default for a known-minor account, and continues refining tone per individual via AI_Memory, consistent with `Assistant.md`'s per-user adaptation approach.
- Surfaces Guardian's urgent findings prominently in the Super Admin's briefing, since they shouldn't be missed by only living on the Admin Dashboard (per `Guardian.md`).
- Does not generate new suggestions itself — the briefing surfaces existing `AI_Suggestion` and Guardian output, it doesn't independently create new ones (that remains Advisor's and Guardian's job, respectively).

## Permissions

- An individual briefing only ever shows data the viewing user already has permission to see — no different than any other view in the system.
- The family-wide briefing shows calendar/task information across the family; per `Folder_Permissions.md`'s shared family folder model, this is viewable by all family members by default, with any future restriction handled the same way folder permissions are managed elsewhere.

## Dependencies

- Builds on `Calendar`/`Task` entities, `Advisor.md` (suggestion source), `Guardian.md` (findings source), `AI_Architecture.md` (tone adaptation via AI_Memory), and `Folder_Permissions.md` (family-wide briefing access).
- Feeds into `Dashboard.md` and `Dashboard_Layout.md`, since the Morning Briefing effectively *is* the default Dashboard experience.

## Future Enhancements

- Configurable delivery timing per user, or generation triggered by first app open of the day, rather than a single fixed time for everyone.
- Possible richer family-wide briefing features (e.g., highlighting scheduling conflicts across family members) as usage patterns emerge.

## Questions

None currently open.
