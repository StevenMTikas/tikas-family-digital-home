# Tasks

## Purpose

Defines the Tasks module — building on the existing Task entity (`Data_Model.md`), covering who can assign tasks to whom, visibility, completion/editing rights, and reminders. Keeps MVP scope flat (no priorities/categories yet) while planning ahead for that.

## Goals

- Support parent-assigned tasks (e.g., chores) without letting the assignment relationship run the other direction — a child cannot assign a task to a parent.
- Keep task visibility and reminder behavior consistent with the pattern already established in `Calendar.md`, so the app feels predictable across modules.
- Keep completion easy (owner, assigner, or admin can mark done) while keeping editing tighter (assigner or admin only).

## User Stories

- As a parent, I want to assign a chore or task directly to Malachi.
- As Malachi, I want to be able to create and manage my own tasks, but not assign tasks to my parents.
- As a family member, I want to see the whole family's tasks by default, the same way I see the shared calendar.
- As a task owner, I want to be able to mark my own task complete without needing to ask whoever assigned it.
- As whoever assigned a task, I want to be the one (along with admins) who can actually edit its details.

## Features

- **Self-assignment:** any family member can create a task for themselves.
- **Parent-to-child assignment only:** a user with an **Admin** or **Super Admin** role can assign a task to any other family member, including a child. A **Basic User** (e.g., Malachi) can only create tasks for themselves — they cannot assign a task to a parent or another family member.
- **Visible by default, same as Calendar.** Tasks are visible to the whole family by default, with the same private-by-choice option established in `Calendar.md` — the creator/assigner can mark a specific task private if desired.
- **Completion rights:** the task's **owner**, whoever **assigned** it (if different from the owner), and **admins** can all mark a task complete.
- **Editing rights:** only whoever **assigned** the task and **admins** can edit its details (title, due date, description) — the owner alone (if they didn't assign it to themselves) cannot edit it, only complete it. If a task is self-assigned, the owner and assigner are the same person, so they can both edit and complete it.
- **Flat structure for MVP.** No priority levels or categories yet — title, owner, due date, status only. Priorities are a planned near-term upgrade (see Future Enhancements).
- **Real-time reminders.** Due-date reminders deliver as real-time Notifications, the same pattern as `Calendar.md`.

## Screen Layout

- **Task list (weekly-ish view, consistent with Calendar's MVP scope):** shows the family's tasks, indicating owner and due date, with completed tasks visually distinguished (not necessarily hidden).
- **Task detail:** title, description, owner, assigned_by (if different from owner), due date, status, visibility.
- **Add/Edit Task:** title, description, due date, assign-to (defaults to self; only shown as assignable-to-others for Admin/Super Admin roles), visibility toggle (public by default).
- Private tasks are simply omitted from other family members' view, same as private events in `Calendar.md`.

## Data Stored

Extends the existing **Task** entity (`Data_Model.md`) with:

| Field | Notes |
|---|---|
| assigned_by | the user who assigned the task; equals owner_id for self-assigned tasks. Only settable to a different user by an Admin/Super Admin — a Basic User cannot set this to anyone but themselves. |
| visibility | public (default) / private — same model as Calendar's Event visibility |

## AI Responsibilities

- Reminder delivery is triggered based on the Task's due date, routed through the standard real-time Notification path (per `Data_Flow.md`, same pattern as `Calendar.md`).
- Advisor may suggest task-related items (e.g., "task nearing due date with no activity," "unassigned task") per its existing starter list in `Advisor.md` — no new suggestion types introduced here.

## Permissions

- **Create (self):** any family member.
- **Create (assign to someone else):** Admin or Super Admin role only — a Basic User cannot assign a task to another family member.
- **View:** all family members can view public tasks by default; private tasks are visible only to the owner, assigner, and admins.
- **Complete:** owner, assigner, or admin.
- **Edit:** assigner or admin only.
- No new permission concepts beyond the existing role model in `Authorization.md` — the parent-to-child assignment rule is enforced by checking the assigning user's role (Admin/Super Admin vs. Basic User), not a new standalone permission.

## Dependencies

- Builds on `Data_Model.md` (Task entity, with the additions above), `Authorization.md` (role-based assignment rule), `Calendar.md` (shared visibility pattern), `Advisor.md` (task-related suggestions), and the Notifications module (real-time reminders).

## Future Enhancements

- Priority levels and categories (e.g., chore vs. errand vs. school) — explicitly planned, not deferred indefinitely.
- Recurring tasks and sub-tasks (already noted as a future item in `Data_Model.md`).

## Questions

None currently open.
