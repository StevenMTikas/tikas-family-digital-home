# Coding Standards

## Purpose

Defines the concrete, day-to-day coding conventions for Tikas Family Digital Home — naming, formatting, TypeScript usage, git practices, and code review approach for a solo developer. Where `Cursor_Project_Rules.md` is the project's constitution (non-negotiable principles) and `Application_Architecture.md` defines structural conventions (routing, error shape), this document is the practical style guide referenced during everyday coding.

## Goals

- Keep code readable by a solo developer months later, per `Cursor_Project_Rules.md`'s existing rule — this document makes that concrete rather than aspirational.
- Use TypeScript and tooling to catch mistakes early, since there's no second developer to catch them in review.
- Keep conventions boring and standard where possible — familiar patterns are easier to pick back up after time away than clever, bespoke ones.

## User Stories

- As a solo developer, I want consistent naming and formatting so the codebase doesn't feel like it was written by different people on different days.
- As a solo developer, I want TypeScript and linting to catch mistakes before they become bugs, since there's no second developer to catch them for me.
- As a solo developer coming back to this code in six months, I want commit history and code comments that explain *why*, not just *what*.

## Features

### Language & Tooling

- **TypeScript throughout** — both frontend and backend (Next.js API routes, Node), not plain JavaScript. Catches type mismatches at compile time rather than runtime, which matters more without a second developer reviewing changes.
- **ESLint + Prettier** — intended to run automatically (pre-commit hook or editor integration) so formatting is never a manual decision. **Known gap (as of 2026-08-03): `npm run lint` currently fails outright** — the repo pins ESLint 9, which requires a flat `eslint.config.js` that doesn't exist yet, and there is no pre-commit hook of any kind wired up. `tsc --noEmit` (strict TypeScript, below) is the only automated check actually catching mistakes today; fixing lint means adopting a flat config and triaging whatever it surfaces across the codebase.
- **Strict TypeScript config** (`strict: true`) — no implicit `any`, no unchecked nulls, to catch the class of bugs most likely to slip through without code review.

### Naming Conventions

- **Files:** `kebab-case` for files (`event-card.tsx`), matching Next.js App Router conventions.
- **Components:** `PascalCase` (`EventCard`).
- **Functions/variables:** `camelCase`.
- **Constants:** `UPPER_SNAKE_CASE` only for true constants (e.g., `MAX_ACTIVE_SUGGESTIONS = 10`, echoing `Advisor.md`'s display limits) — not for every top-level `const`.
- **Database fields:** `snake_case`, matching the field names already used throughout `Data_Model.md` (e.g., `admin_scope`, `is_sensitive`) — keeps the schema and the docs in the same vocabulary.

### File Organization

- Follows `Application_Architecture.md`'s established structure exactly — module folders under `/app` and `/app/api`, shared core services under `/lib/core`, API client functions under `/lib/api`. This document doesn't redefine structure, only the conventions within it.
- One component per file; co-locate a component's own styles/types with it rather than centralizing into shared files unless genuinely reused across modules.

### Comments

- **Comments explain *why*, not *what*.** Per `Cursor_Project_Rules.md`'s existing rule: if code needs a comment to explain what it does, rewrite it to be clearer instead. Reserve comments for non-obvious reasoning (e.g., "checking folder permission here, not role, because Security_Architecture.md requires per-item scoping").
- Reference the relevant doc when a piece of code implements a specific documented rule (e.g., `// see AI_Permissions.md — sensitive gate unavailable to minors`), so the connection between spec and code stays traceable.

### Git Practices

- **Commit messages:** short, present-tense summary line ("Add folder permission override for Super Admin"), with a body explaining *why* when the reasoning isn't obvious from the diff alone — mirroring the same why-not-what principle as code comments.
- **Branching:** feature branches per module or meaningful unit of work (e.g., `feature/calendar-module`), merged to main once working — no long-lived parallel branches, given there's no team to coordinate around.
- **Commit early, commit often.** Small, focused commits are easier to review (even self-review) and easier to revert than large, sprawling ones.

### Code Review (Solo Developer)

- No second-developer review exists, so **self-review before merging** is the substitute: re-read the diff as if reviewing someone else's work, check it against the relevant module doc's Features/Permissions sections, and run tests before merging to main.
- Claude Code/Cursor can serve as a second set of eyes for this self-review step (per the earlier discussion on tooling), but a human decision to merge remains the final gate — consistent with `Cursor_Project_Rules.md`'s emphasis on human review over automation.

## Screen Layout

- Not applicable — this document governs code, not UI.

## Data Stored

- None.

## AI Responsibilities

- None directly — this document standardizes how a human (or AI coding assistant, per the earlier Cursor/Claude Code discussion) writes code, not the app's own AI behavior.

## Permissions

- None.

## Dependencies

- Builds on `Cursor_Project_Rules.md` (the principles this document makes concrete) and `Application_Architecture.md` (the structure these conventions apply within).

## Future Enhancements

- Automated CI checks (lint/type-check/test on every push) once the project reaches a stage where that's worth setting up.
- Revisit branching strategy if this project ever gains a second developer or contributor.

## Questions

None currently open.
