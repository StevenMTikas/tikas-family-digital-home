# Advisor

## Purpose

Defines the behavior of the Advisor — the AI role responsible for proactive, thoughtful recommendations rather than direct answers. Where the Assistant responds to what's asked, the Advisor notices what wasn't asked about but might matter. This resolves the open trigger-model question from `AI_Architecture.md` and defines where, how often, and about what the Advisor speaks up.

## Goals

- Make suggestions genuinely useful and timely, not noisy — earning trust the way `Core_Principles.md` describes ("trust is earned slowly").
- Keep the Advisor reachable both centrally (Dashboard) and contextually (inside the module it's relevant to), without overwhelming either location.
- Allow any AI role to hand off to the Advisor when something worth suggesting comes up — the Advisor isn't a silo, it's where proactive recommendations converge regardless of which agent noticed the opportunity.

## User Stories

- As a family member, I want the Dashboard to show me a handful of genuinely useful suggestions, not an overwhelming list.
- As a family member, I want relevant suggestions to show up right where I'm working (e.g., inside Calendar), not just buried on the Dashboard.
- As a family member, I want the system to catch things on a regular basis, not only right when something changes — so a slow-building issue (like an outdated document) still eventually gets surfaced.
- As a family member, I want to give feedback (thumbs up/down) on suggestions so the Advisor gets better at knowing what I actually find useful.

## Features

### Trigger Model: Event-Driven + Weekly Check

- **Primary trigger: specific events.** The Advisor generates a suggestion when something happens that warrants one — a new document uploaded, a calendar gap detected, a task left unassigned, and similar (see Suggestion Types below).
- **Secondary trigger: a weekly check.** In addition to event-driven suggestions, the Advisor runs a broader review on a weekly cadence to catch things that build up slowly and wouldn't otherwise trigger an event (e.g., a Family Knowledge item that hasn't been reviewed in months).

### Display Locations & Limits

| Location | Max Active Suggestions | Notes |
|---|---|---|
| **Dashboard** | 10 | Primary home for suggestions; broadest view across all modules. |
| **Contextual (inside a specific module)** | 2 | Only the most relevant suggestions for that module are shown in-context — e.g., Calendar shows at most 2 Calendar-relevant suggestions while you're in Calendar. |

If more suggestions exist than the display limit allows, they are prioritized **by relevancy first, then by most recent** as a tiebreak — the suggestions most pertinent to the user's current situation are shown ahead of ones that are simply newer. The rest remain queued (stored as `AI_Suggestion` records, per `Data_Model.md`) until shown or superseded.

### Suggestion Types (Starter List)

A first-pass list to seed the Advisor's scope — expected to grow as real usage reveals what's actually useful:

- **Calendar:** an event with no reminder set; two events that conflict; a recurring pattern that suggests a new event should be added.
- **Tasks:** a task nearing its due date with no recent activity; a task with no assigned owner.
- **Documents:** a newly uploaded document that seems relevant to an existing task or event; a document left uncategorized.
- **Family Knowledge:** an item (e.g., insurance record) that hasn't been updated in a long time and may be stale; a category (e.g., medical contacts) with no entries yet.
- **Photos & Memory:** a cluster of recent photos from what looks like an event, with a suggestion to turn them into a Memory; an uncategorized/untagged photo.
- **General household health:** patterns Guardian surfaces that are better framed as an actionable suggestion than a passive alert (see Cross-Role Triggering below).

### Cross-Role Triggering

- **Any AI role can trigger an Advisor suggestion.** The Advisor isn't limited to noticing things on its own — if the Assistant, during a conversation, notices something worth proactively suggesting, or Guardian's monitoring surfaces something better framed as a recommendation than a background alert, either can hand that off to the Advisor to generate and surface a suggestion.
- This keeps the three roles cooperative rather than siloed: Assistant responds, Guardian watches, Advisor recommends — but any of them can feed the Advisor an opportunity.

## Screen Layout

- **Dashboard:** a suggestions area showing up to 10 active `AI_Suggestion` items, each with a thumbs up/down control.
- **Contextual (per module):** a smaller suggestions area (max 2) shown within the relevant module's screen, using the same thumbs up/down pattern for consistency.
- Dismissed or acted-on suggestions are removed from the active display but remain in the `AI_Suggestion` record for feedback/learning purposes.

## Data Stored

- Uses the existing **AI_Suggestion** entity from `Data_Model.md` — no new entity required. Relevant existing fields (`module`, `content`, `feedback`) already support Advisor's needs.
- Consider extending `AI_Suggestion` with a `trigger_type` field (event vs. weekly_check) and a `display_context` field (dashboard vs. contextual + which module) to support the display-location logic above — noted for `Data_Model.md` update.

## AI Responsibilities

- Follows the shared prompt structure from `AI_Architecture.md`: Base Layer → Role Layer (Advisor-specific: recommend, don't just respond; prioritize genuine usefulness over volume) → Context Layer (starts narrow per the triggering event, expands only as needed).
- Respects the suggest-only constraint from `AI_Permissions.md` — the Advisor never takes an action on its own, only proposes one for a human to accept or dismiss.
- Enforces the same permission scoping as every other agent — a suggestion is only generated using data the relevant user already has access to.
- Routes through `/lib/core/ai` for permission checks, logging, and (if a suggestion involves sending anything outside the home) the outside-call/sensitive-data approval flow from `Security_Architecture.md` and `AI_Permissions.md`.

## Permissions

- Advisor suggestions for a given user are generated only from data that user has permission to see — same rule as Assistant.
- No special Advisor-only permission is introduced; it operates within the existing role/permission model from `Authorization.md`.

## Dependencies

- Builds on `AI_Architecture.md` (engine, shared prompt structure), `AI_Permissions.md` (suggest-only constraint), `Data_Model.md` (AI_Suggestion entity), and interacts with `Assistant.md` and `Guardian.md` via cross-role triggering.
- Feeds into `Dashboard.md` (primary display location) and every module doc that will define its own contextual suggestion area.

## Future Enhancements

- Refine suggestion-type list based on real household usage.
- Possible autonomous action for select, low-risk suggestion types, if suggest-only proves overly conservative once trust is established (echoes the same future consideration noted for Guardian in `AI_Permissions.md`).

## Questions

None currently open.
