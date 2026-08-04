# Homeschool

## Purpose

Defines the Homeschool/education-tracking module — a real, current need for this family (Malachi's homeschooling), not a hypothetical. Rather than inventing a parallel system, this module **extends the existing Task entity** (`Data_Model.md`) with an optional companion detail row, reusing Tasks' assignment rules, recurrence, visibility, and notifications as-is. Scoped from the `Future_Ideas.md` bullet flagged 2026-07-27 as "the first item from this list to actually work on."

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
- As a family member, I want to filter the Tasks list down to just one subject, the same way I can already filter down to one person.

## Features

- **Homework is a Task with a linked detail row.** Picking a Subject on the Add/Edit Task form is what makes a Task "homework" — there's no separate "is this homework" toggle. Leaving Subject blank keeps it a normal Task.
- **Subject is a managed lookup list**, not a fixed enum — follows the Document Category pattern (`Data_Model.md`), since subjects genuinely change year to year (new school year, new curriculum) unlike Calendar's stable category list. A Super Admin can rename (cascades everywhere referenced) or delete (blocked while any homework item still uses it) from their profile page's "Subjects" section, same UX as Document Categories.
- **Curriculum reference** — optional free text (e.g., "Saxon Math Lesson 42," "Reading Log Week 3").
- **Grading / parent sign-off** — optional grade-or-score (deliberately loose typing — "B+", "18/20", "Complete" — homeschool grading isn't standardized), parent notes, and a signed-off-by/signed-off-at checkpoint distinct from the Task's own `done`/`not_done` status. "I did it" (Malachi marking the Task done) and "a parent reviewed it" (grading/sign-off) are two different events.
- **Recurring and ad-hoc, both** — reuses Task's existing `recurrence_id`/`recurrence_frequency`/`recurrence_until` fields verbatim (see `Tasks.md`'s "Recurrence Editing & Deletion"). A standing pattern ("reading log due daily") is a recurring Task with a Homework Detail row; a one-off assignment ("Chapter 4 review, due Thursday") is a normal one-off Task with a Homework Detail row. No new recurrence mechanism.
- **Subject filter, alongside the existing person filter.** Tasks' person-filter legend (`Tasks.md`) gets a parallel Subject filter — click a subject to filter Overdue/Today/This Week/Completed down to that subject's homework, same click-to-filter interaction already built.

## Screen Layout

Extends the existing Tasks screen rather than building a new one:

- **Subject filter** — alongside Tasks' person-filter legend; click a subject chip to filter the list down to that subject's homework, click again (or select none) to show everyone/everything.
- **Add/Edit Task form** — gains an optional "Subject" field (existing subjects to choose from, plus a "+ New subject" option that free-text-creates one, same pattern as Documents' category picker). Picking a Subject reveals: Curriculum Reference (anyone who can edit the Task can set this); Grade/Score, Parent Notes, and Sign Off (visible and editable only to an Admin/Super Admin, regardless of who created or is assigned the Task).
- **Task detail** — shows Subject, Curriculum Reference, and (if present) Grade/Score, Parent Notes, and who signed off and when, alongside the existing title/description/owner/due-date/status/visibility/repeats.
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
- **Assign to someone else:** Admin or Super Admin only, same as Tasks.md — no change.
- **Edit title/due date/description/Subject/Curriculum Reference:** whoever assigned the Task, or an admin — same as Tasks.md's existing edit rule, unchanged.
- **Complete (mark the Task itself done):** owner, assigner, or admin — same as Tasks.md, unchanged.
- **Write Grade/Score, Parent Notes, Sign Off:** **Admin or Super Admin only**, regardless of who the Task's assigner is. This is the one real refinement beyond Tasks.md as-is: Malachi could self-assign a reading-log Task (making himself the "assigner"), but he still cannot write his own grade or sign off on his own homework. A narrow, explicit exception on three fields — not a new permission system.
- **Subject management (rename/delete):** Super Admin only, same as Document Categories.
- **View:** follows the Task's own visibility rule unchanged (public by default, private to owner/assigner/admins).

## Dependencies

- Builds on `Data_Model.md` (Task entity, plus the new Subject/Homework_Detail entities), `Tasks.md` (assignment, recurrence, visibility, editing/completion rights — all reused as-is), `Data_Model.md`'s Document Category entity (the pattern Subject follows), and `Authorization.md` (role checks for the Admin/Super-Admin-only grading fields).

## Future Enhancements

- Advisor suggestions for homework (e.g., "no homework logged in 3 days," mirroring the Guardian "quiet pattern" idea in `Future_Ideas.md`'s New Feature Concepts) — a natural fit later, not core to getting this working now.
- Multi-household/co-op sharing — `Future_Ideas.md` flags this as a plausible vertical product for other homeschool families later; out of scope for this single-household pass, same as every other module's commercial considerations are deferred elsewhere in this project.

## Questions

None currently open.
