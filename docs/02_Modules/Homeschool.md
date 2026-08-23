# Homeschool

## Purpose

Defines the Homeschool/education-tracking module — a real, current need for this family (Malachi's homeschooling), not a hypothetical. Rather than inventing a parallel system, this module **extends the existing Task entity** (`Data_Model.md`) with an optional companion detail row, reusing Tasks' assignment rules, recurrence, and notifications as-is. Scoped from the `Future_Ideas.md` bullet flagged 2026-07-27 as "the first item from this list to actually work on."

**Revised 2026-08-23 (Steven):** the data model still extends Task, but the *screen* is its own dedicated destination in the left nav — not a bolt-on to the Tasks screen as originally scoped. Tasks stays a plain task list with no Subject field anywhere in it; every homework-specific control (calendar, Subject picker, curriculum reference, grading) lives only on the Homeschool screen. Two other refinements landed at the same time: the assignee picker here is restricted to children only (not every family member Tasks' picker offers), and a homework assignment's visibility is always public — there's no private-assignment concept, so the toggle Tasks has is simply absent here.

## Goals

- Support the full education-tracking vision (subjects, curriculum references, grading/parent sign-off) — not just a bare due-date list — without duplicating Tasks' plumbing.
- Keep a plain chore or errand Task completely unaffected: no new fields, no new UI, unless a Subject is actually attached.
- Give grading/sign-off a real permission boundary distinct from Tasks.md's normal edit rights — a child can log their own homework but shouldn't be able to grade or sign off on it themselves.

## User Stories

- As Vee (Malachi's scoped Admin), I want to assign Malachi a homework Task tagged with a subject and curriculum reference, so it shows up alongside his other tasks with real academic context.
- As Malachi, I want to log my own homework (e.g., a reading log entry) the same way I create any other self-assigned task.
- As Malachi, I want to mark my homework done the moment I finish it, without waiting on a parent.
- As Vee, I want to record a grade or score and sign off on a piece of homework after reviewing it — a separate checkpoint from Malachi just marking it done.
- As Malachi, I should not be able to write my own grade, notes, or sign-off, even on homework I created myself.
- As a family member, I want to filter the Homeschool screen down to just one subject or one child.
- As Vee, when I open Add Assignment, I want the assignee picker to only offer my children — not the whole family — since an assignment is never given to another parent.
- As a family member, I want to see a calendar of what's due when, not just a flat list, since a homeschool schedule is naturally date-driven.

## Features

- **Homework is a Task with a linked detail row.** An assignment created on the Homeschool screen is a normal Task underneath, with a Homework_Detail row attached — there's no separate "is this homework" flag, and a homework Task still shows up in the shared family Tasks list like any other Task (reusing 100% of Tasks' assignment/recurrence/notification plumbing). The Tasks screen itself has no Subject field at all — that control exists only here.
- **Subject is a managed lookup list**, not a fixed enum — follows the Document Category pattern (`Data_Model.md`), since subjects genuinely change year to year (new school year, new curriculum) unlike Calendar's stable category list. A Super Admin can rename (cascades everywhere referenced) or delete (blocked while any homework item still uses it) from their profile page's "Subjects" section, same UX as Document Categories. Subject is **required** on every assignment created here (unlike a Document's optional category), since everything on this screen is homework by definition.
- **Curriculum reference** — optional free text (e.g., "Saxon Math Lesson 42," "Reading Log Week 3").
- **Grading / parent sign-off** — optional grade-or-score (deliberately loose typing — "B+", "18/20", "Complete" — homeschool grading isn't standardized), parent notes, and a signed-off-by/signed-off-at checkpoint distinct from the Task's own `done`/`not_done` status. "I did it" (Malachi marking the Task done) and "a parent reviewed it" (grading/sign-off) are two different events.
- **Recurring and ad-hoc, both** — reuses Task's existing `recurrence_id`/`recurrence_frequency`/`recurrence_until` fields verbatim (see `Tasks.md`'s "Recurrence Editing & Deletion"). A standing pattern ("reading log due daily") is a recurring Task with a Homework Detail row; a one-off assignment ("Chapter 4 review, due Thursday") is a normal one-off Task with a Homework Detail row. No new recurrence mechanism. A recurring assignment's Subject carries forward onto each generated occurrence; curriculum reference/grade/notes/sign-off start fresh each time, same as status.
- **Assignee restricted to children.** The Add/Edit Assignment form's "Assign to" picker only offers accounts that are a child on this family's account (i.e., appear in some Admin's `admin_scope` — see `Authorization.md`) — never another parent/admin. This generalizes to more than one child, and to "children on the account for other families" if this ever becomes a multi-household product.
- **Visibility is always public.** Unlike Tasks (public by default, private optional), a homework assignment has no visibility choice at all — it's always visible to the whole family, matching how a homeschool schedule is naturally a shared, not a private, thing.
- **Subject + child filters.** Click a subject chip, or a child's name (when there's more than one child), to filter the calendar/list down — same click-to-filter interaction Tasks/Calendar already use.

## Screen Layout

A dedicated "Homeschool" destination in the main nav (`Navigation.md`), separate from Tasks:

- **Month calendar at the top.** Each day cell lists that day's assignments (title, colored/bordered by subject), same visual language as Calendar's month view; clicking an assignment opens its detail modal. Prev/Today/Next controls move between months.
- **"+ Add Assignment" button** opens one modal covering every Task + Homework_Detail field together: Title, Description, Due Date, Repeats (creation only), Assign to (children only — hidden entirely for a Basic User, who can only self-assign), Subject (required — existing subjects to choose from, plus a "+ New subject" free-text option, same pattern as Documents' category picker), Curriculum Reference, and — visible only to an Admin/Super Admin — Grade/Score, Parent Notes, and Sign Off. No visibility control; assignments are always public.
- **Subject and child filter chips**, and an Overdue/Today/This Week/Completed list below the calendar (identical grouping logic to Tasks, scoped to homework only).
- **Assignment detail** — shows Subject, Curriculum Reference, and (if present) Grade/Score, Parent Notes, and who signed off and when, alongside the underlying Task's title/description/owner/due-date/status/repeats. Edit opens the same Add/Edit Assignment modal.
- **Subject management** — a "Subjects" section on the Super Admin's profile page, next to the existing "Document Categories" section: rename/delete, same rules (delete blocked while any homework item still uses the subject).

## Data Stored

**No changes to the Task entity itself.** Adds two new entities to `Data_Model.md`:

- **Subject** — `id`, `name` (free text, Super-Admin-managed, unique).
- **Homework_Detail** — one row per homework Task: `task_id` (FK to Task, unique — this row's existence is the "this Task is homework" marker), `subject_id` (FK to Subject), `curriculum_reference` (optional), `grade_or_score` (optional, loose text), `parent_notes` (optional), `signed_off_by` / `signed_off_at` (who/when a parent reviewed it).

A companion table, not new columns on Task, because these fields are meaningless for the other ~95% of Tasks (chores, errands) — keeps Task itself clean and reuses 100% of its assignment/recurrence/visibility/notification logic untouched, same shape as how Document Category relates to Document.

## AI Responsibilities

- No new AI behavior in this pass. Homework Tasks flow through the exact same reminder/notification path as any other Task (`Tasks.md`'s "Real-time reminders").
- Advisor may eventually suggest homework-specific patterns (e.g., "no homework logged in 3 days") — explicitly deferred, see Future Enhancements.

## Permissions

- **Create / self-assign:** any family member, same as Tasks.md.
- **Assign to someone else:** Admin or Super Admin only, same role check as Tasks.md — **narrowed further here**: the picker itself only ever offers child accounts (a user appearing in some Admin's `admin_scope`), so in practice an Admin/Super Admin can only assign an assignment to a child, never to another adult, even though the underlying `/api/tasks` permission check is the same one Tasks.md uses.
- **Edit title/due date/description/Subject/Curriculum Reference:** whoever assigned the Task, or an admin — same as Tasks.md's existing edit rule, unchanged.
- **Complete (mark the Task itself done):** owner, assigner, or admin — same as Tasks.md, unchanged.
- **Write Grade/Score, Parent Notes, Sign Off:** **Admin or Super Admin only**, regardless of who the Task's assigner is. This is the one real refinement beyond Tasks.md as-is: Malachi could self-assign a reading-log Task (making himself the "assigner"), but he still cannot write his own grade or sign off on his own homework. A narrow, explicit exception on three fields — not a new permission system.
- **Subject management (rename/delete):** Super Admin only, same as Document Categories.
- **Visibility:** always public, not a per-item choice — no private homework assignment exists.
- **View:** every family member sees every assignment (per the always-public rule above); a Basic User only ever sees the "Assign to" picker for their own account, since they can't assign to anyone else.

## Dependencies

- Builds on `Data_Model.md` (Task entity, plus the new Subject/Homework_Detail entities), `Tasks.md` (recurrence, editing/completion rights, and the underlying `/api/tasks` plumbing — all reused as-is), `Calendar.md` (the month-grid visual pattern this screen's calendar reuses), `Data_Model.md`'s Document Category entity (the pattern Subject follows), `Authorization.md` (role checks for the Admin/Super-Admin-only grading fields, and Admin Scope for the children-only assignee picker), and `Navigation.md` (this screen's own nav entry).

## Future Enhancements

- Advisor suggestions for homework (e.g., "no homework logged in 3 days," mirroring the Guardian "quiet pattern" idea in `Future_Ideas.md`'s New Feature Concepts) — a natural fit later, not core to getting this working now.
- Multi-household/co-op sharing — `Future_Ideas.md` flags this as a plausible vertical product for other homeschool families later; out of scope for this single-household pass, same as every other module's commercial considerations are deferred elsewhere in this project.

## Questions

None currently open.
