# Calendar

## Purpose

Defines the Calendar module — the shared family calendar built on the existing Event and Event_Assignment entities (`Data_Model.md`). Covers the MVP's weekly view, per-person color coding, event visibility, editing rights, and real-time reminder delivery.

## Goals

- Give the family one shared calendar that's easy to scan at a glance, with individual events visible by default rather than siloed per person.
- Keep MVP scope disciplined — one-off events and a weekly view only — while clearly marking recurrence and additional views as near-term upgrades.
- Keep editing rights simple and predictable: the creator and admins, nobody else, can change an event.

## User Stories

- As a family member, I want to see the whole family's schedule for the week at a glance, color-coded by person.
- As a family member, I want my events visible to everyone by default, with the option to keep a specific event private if I choose.
- As a family member, I want to be reminded of an event as it approaches, in real time.
- As a family member, if I'm one of several people assigned to an event, I want to know only the creator or an admin can change it — not just anyone it's assigned to.

## Features

- **One-off events only for MVP.** No recurring events yet — each event is a single, standalone entry. Recurrence is a clearly planned near-term upgrade (see Future Enhancements).
- **Weekly view for MVP.** A single default view showing the week at a glance. Day and month views are planned for future releases, not built now.
- **Shared family calendar.** All family members' events appear together on one calendar, alongside whole-family items (e.g., a family outing), rather than each person having a fully separate calendar.
- **Visible by default, private by choice.** An event a user creates is visible to the whole family by default. The creator can mark a specific event private if they don't want it shown to others.
- **Per-person color coding.** Each family member's events display in their assigned color for quick scanning: **Dad — blue, Vee — purple, Malachi — red.** New family members added later are assigned a color automatically from an expanding palette, following the same pattern used elsewhere for generalizing beyond the initial three-person household (e.g., `admin_scope` in `Authorization.md`).
- **Editing restricted to creator + admins.** For a multi-person event (via `Event_Assignment`), only the event's creator or an admin can edit or cancel it — being assigned to an event does not grant edit rights.
- **Real-time reminders.** Reminders (per the Event entity's `reminder_lead_time` field) deliver as real-time Notifications, the same channel as the rest of the system (per `Data_Flow.md`'s notification scenario).

## Screen Layout

- **Weekly view:** the default and only view for MVP — a 7-day grid showing events color-coded by the person(s) they belong to.
- **Event detail:** shows title, description, date/time, assigned family member(s), visibility (public/private), category (if set), and reminder setting.
- **Add/Edit Event:** a simple form — title, description, date/time, assign to one or more family members, visibility toggle (public by default), category (optional dropdown: Budget / Home Repair / Chores / Medical / School / Social/Family), reminder lead time.
- Private events are simply omitted from other family members' view of the shared calendar — no placeholder or indication that a hidden event exists.

## Data Stored

Extends the existing **Event** entity (`Data_Model.md`) with:

| Field | Notes |
|---|---|
| visibility | public (default) / private — private events are only visible to their creator (and admins, per standard admin visibility) |
| category | optional, one of a fixed set: Budget / Home Repair / Chores / Medical / School / Social/Family — single-select, no custom values for MVP |

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

- Recurring events (e.g., "every Tuesday") — explicitly planned as a near-term upgrade, not deferred indefinitely.
- Day and month calendar views, in addition to the MVP's weekly view.
- Possible conflict-detection UI beyond what Advisor already flags as a suggestion (e.g., a visual overlap indicator directly on the calendar grid).

## Questions

None currently open.
