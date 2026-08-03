# Calendar

## Purpose

Defines the Calendar module — the shared family calendar built on the existing Event and Event_Assignment entities (`Data_Model.md`). Covers the MVP's weekly view, per-person color coding, event visibility, editing rights, and real-time reminder delivery.

## Goals

- Give the family one shared calendar that's easy to scan at a glance, with individual events visible by default rather than siloed per person.
- Keep MVP scope disciplined — one-off events, with Week/Month/Day views — while clearly marking recurrence as a near-term upgrade.
- Keep editing rights simple and predictable: the creator and admins, nobody else, can change an event.
- Make it easy to scan just one person's schedule without losing the shared, everyone-by-default view — a quick filter, not a separate per-person calendar.

## User Stories

- As a family member, I want to see the whole family's schedule for the week at a glance, color-coded by person.
- As a family member, I want my events visible to everyone by default, with the option to keep a specific event private if I choose.
- As a family member, I want to be reminded of an event as it approaches, in real time.
- As a family member, if I'm one of several people assigned to an event, I want to know only the creator or an admin can change it — not just anyone it's assigned to.

## Features

- **Recurring events.** Daily / weekly / biweekly / monthly / yearly. Each occurrence is its own real, independently editable/deletable Event row sharing a `recurrence_id` — not a single "rule" computed on the fly. A background scheduler pass keeps every active series filled in with occurrences roughly 3 months ahead, so a series set to run indefinitely never needs the user to act. See "Recurrence Editing & Deletion" below for how edits/deletes on a recurring event behave.
- **Week, Month, and Day views** (built 2026-08-02 — Month/Day were originally deferred to a future release, but built once real usage called for them). A tab switcher (Week / Month / Day) at the top of the screen; **Week remains the default view** on first load. Prev/Today/Next navigation is view-aware (a week, a month, or a single day at a time). Clicking a day's number in Month view jumps straight to that day's Day view. Month view shows up to 3 event chips per day plus a "+N more" overflow link (also to Day view) rather than trying to fit every event in a small cell.
- **Shared family calendar.** All family members' events appear together on one calendar, alongside whole-family items (e.g., a family outing), rather than each person having a fully separate calendar.
- **Visible by default, private by choice.** An event a user creates is visible to the whole family by default. The creator can mark a specific event private if they don't want it shown to others.
- **Per-person color coding.** Each family member's events display in their assigned color for quick scanning: **Dad — blue, Vee — purple, Malachi — red.** New family members added later are assigned a color automatically from an expanding palette, following the same pattern used elsewhere for generalizing beyond the initial three-person household (e.g., `admin_scope` in `Authorization.md`).
- **Click a name to filter to just that person** (built 2026-08-02). Each family member's name in the color-key legend is a toggle button — clicking it filters all three views (Week/Month/Day) down to events that person is assigned to (including multi-person events they're part of, not just solo ones). Clicking the same name again, or having none selected, **shows everyone — the default, unchanged.** This is a client-side display filter only, not a separate saved view or URL state; it resets on navigating away. The "Family" legend key itself isn't clickable (there's no single "whole-family" assignee to filter to — a multi-assignee event just shows whenever any of its assignees is the active filter, per the rule above).
- **Editing restricted to creator + admins.** For a multi-person event (via `Event_Assignment`), only the event's creator or an admin can edit or cancel it — being assigned to an event does not grant edit rights.
- **Real-time reminders.** Reminders (per the Event entity's `reminder_lead_time` field) deliver as real-time Notifications, the same channel as the rest of the system (per `Data_Flow.md`'s notification scenario).

## Screen Layout

- **View switcher:** Week / Month / Day tabs at the top of the screen. Week is the default on first load; switching views keeps the same anchor date (e.g., switching from a week that includes August 10th to Day view lands on August 10th).
- **Weekly view:** a 7-day grid showing events color-coded by the person(s) they belong to.
- **Monthly view:** a 6-row, 7-column grid (always a fixed 42 cells, so the page height doesn't shift month to month) starting from the Sunday on/before the 1st — leading/trailing days from adjacent months are shown dimmed but still populated with their real events. Each day shows up to 3 compact event chips plus a "+N more" link; clicking a day's number or the overflow link jumps to that day's Day view.
- **Daily view:** a single-column list of the day's events, sorted by time, with more room per event (title, time, who it's for, and description) than Week/Month cells allow.
- **Filter by person:** each family member's name in the color-key legend (visible in all three views) is clickable — see the Features section above.
- **Event detail:** shows title, description, date/time, assigned family member(s), visibility (public/private), category (if set), repeats (if recurring), and reminder setting.
- **Add/Edit Event:** a simple form — title, description, date/time, assign to one or more family members, visibility toggle (public by default), category (optional dropdown: Budget / Home Repair / Chores / Medical / School / Social/Family), repeats (optional dropdown: Daily / Weekly / Every 2 weeks / Monthly / Yearly — creation only, see below), reminder lead time.
- Private events are simply omitted from other family members' view of the shared calendar — no placeholder or indication that a hidden event exists.

## Recurrence Editing & Deletion

- **Frequency is set at creation only.** The Repeats dropdown only appears when creating a new event; editing an existing occurrence shows its frequency as read-only text. Changing how often a series repeats isn't supported — delete the series and create a new one instead.
- **Every edit or delete on a recurring event asks which occurrences it applies to:** *this event only*, *this and future events*, or *all events in the series*. There's no default/silent choice — the app always asks.
- Date/time changes always apply to just the single occurrence being edited, even under "this and future" or "all events" — there's no single date that could sensibly apply to a whole set of differently-dated occurrences. Everything else (title, description, visibility, category, reminder, assignees) can propagate across the chosen scope.
- **Known limitation:** deleting "this event only" when it happens to be the single farthest-out occurrence the scheduler has generated for an active series can be silently regenerated by the next hourly scheduler run — there's no tombstone recording that a specific date was intentionally skipped. In practice this is narrow (the generator keeps ~3 months of occurrences filled in ahead of time, so this only bites right at that horizon) and is a deliberate MVP trade-off rather than a full exception-date system. Deleting a middle occurrence, or "this and future"/"all events," is unaffected.

## Data Stored

Extends the existing **Event** entity (`Data_Model.md`) with:

| Field | Notes |
|---|---|
| visibility | public (default) / private — private events are only visible to their creator (and admins, per standard admin visibility) |
| category | optional, one of a fixed set: Budget / Home Repair / Chores / Medical / School / Social/Family — single-select, no custom values for MVP |
| recurrence_id / recurrence_frequency / recurrence_until | recurring-series fields — see `Data_Model.md`'s Event entity and "Recurrence Editing & Deletion" above |

Extends the **User** entity (`Data_Model.md`) with:

| Field | Notes |
|---|---|
| calendar_color | assigned per user for calendar display; Dad = blue, Vee = purple, Malachi = red for the initial household, auto-assigned from a palette for any new family member added later |

No changes needed to **Event_Assignment** — it already supports multiple assigned family members per event.

## AI Responsibilities

- Reminder delivery is triggered based on the Event's existing `reminder_lead_time` field, routed through the standard real-time Notification path (per `Data_Flow.md`).
- Advisor may suggest calendar-related items (e.g., "no reminder set," "two events conflict") per its existing starter list in `Advisor.md` — this module doesn't introduce new AI suggestion types beyond what's already defined there.

## Permissions

- **View:** all family members can view public events on the shared calendar by default; private events are visible only to their creator and admins.
- **Create:** any family member can create an event and assign it to themselves and/or others.
- **Edit/Delete:** only the event's creator or an admin — being an assigned participant (but not the creator) does not grant edit rights, per your direction.
- No new permission concepts beyond the existing role model in `Authorization.md`.

## Dependencies

- Builds on `Data_Model.md` (Event, Event_Assignment, User entities — with the additions above), `Authorization.md` (edit rights), `Advisor.md` (calendar-related suggestions), and the Notifications module (real-time reminder delivery).

## Future Enhancements

- Changing a recurring series' frequency after creation, and a proper exception-date system for skipped occurrences (see "Recurrence Editing & Deletion"'s known limitation above).
- Possible conflict-detection UI beyond what Advisor already flags as a suggestion (e.g., a visual overlap indicator directly on the calendar grid).
- Persisting the person-filter and/or view choice (e.g., in the URL or a per-user preference) across navigation/reloads — for MVP it's local component state only, so it resets on leaving the page.

## Questions

None currently open.
