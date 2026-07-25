# Testing

## Purpose

Defines the testing approach for Tikas Family Digital Home — expanding on the starting point already set in `Application_Architecture.md` ("prioritize tests for the shared core services first, module-level tests as time allows"). Covers what gets tested, with what tools, and why security-critical paths get the most rigorous coverage.

## Goals

- Test what matters most first: the shared core services (permissions, AI, logging) where a bug has the widest blast radius, per `Application_Architecture.md`'s existing priority.
- Keep the testing toolchain itself minimal, consistent with `Cursor_Project_Rules.md`'s "keep dependencies minimal" rule — no heavyweight test infrastructure for a single-developer project.
- Give security- and permission-related logic disproportionate test coverage relative to its size, since it's the area where a quiet bug does the most damage (e.g., a permission check silently passing when it shouldn't).

## User Stories

- As a solo developer, I want confidence that permission checks actually work, since a bug there could expose family data incorrectly.
- As a solo developer, I want to catch regressions when I change one module without having to manually re-test everything else.
- As a solo developer, I want a testing setup light enough that I'll actually maintain it, not one so heavy it gets abandoned.

## Features

### Priority Order (Per `Application_Architecture.md`)

1. **Shared core services first** (`/lib/core/permissions`, `/lib/core/ai`, `/lib/core/logging`) — these are called by every module, so a bug here has the widest blast radius.
2. **Module-level tests as time allows** — business logic specific to each module (Calendar, Tasks, Documents, etc.), prioritized roughly in the order modules are built.

### Test Types

- **Unit tests** for individual functions, especially permission-check logic, AI service routing, and data validation (e.g., does a Photo upload correctly reject an unpermitted folder). These are the bulk of automated coverage.
- **Integration tests** for API routes — does a request through `/app/api/<module>` correctly enforce permissions, call the right core services, and return the documented error shape (`Application_Architecture.md`)?
- **Manual testing** for UI/UX flows — given no dedicated QA resource, flows defined in `User_Flows.md` are manually walked through before considering a feature complete, rather than relying solely on automated UI tests (which are expensive to write and maintain for a solo developer).

### Security-Critical Paths Get Extra Coverage

Disproportionate test attention goes to:
- Folder permission checks (View/Edit/Delete, inheritance, override — `Folder_Permissions.md`)
- The outside-call approval flow, including the sensitive-data gate and its unavailability to minors (`Security_Architecture.md`, `AI_Permissions.md`)
- Role/scope checks (Super Admin vs. scoped Admin vs. Basic User — `Authorization.md`)
- Device trust gating on login (`Authentication.md`)

These areas get tests written *before* considering the related feature done, not added later — consistent with the weight `Cursor_Project_Rules.md` and `Security_Architecture.md` already place on getting permissions right.

### Toolchain

- **Vitest** for unit and integration tests — lightweight, fast, works natively with TypeScript, minimal configuration overhead compared to heavier alternatives.
- **No dedicated end-to-end browser testing framework for MVP** (e.g., Playwright/Cypress) — the overhead of maintaining full browser-automation tests isn't justified for a single-developer project at this stage; manual walkthroughs of `User_Flows.md` substitute for MVP. Revisit if the project grows (see Future Enhancements).

## Screen Layout

- Not applicable — this document governs testing practice, not UI.

## Data Stored

- None.

## AI Responsibilities

- None directly — this document governs how the app's own code is tested, not the AI's runtime behavior. (Testing the AI service's permission enforcement is covered under "security-critical paths" above, but that's testing the *code*, not the AI's reasoning quality.)

## Permissions

- None.

## Dependencies

- Builds on `Application_Architecture.md` (the priority order this document expands on), `Security_Architecture.md` and `AI_Permissions.md` (security-critical paths), `Authorization.md` (role/scope checks), and `User_Flows.md` (manual walkthrough reference for UI testing).

## Future Enhancements

- Introduce end-to-end browser testing (e.g., Playwright) if the project grows beyond a single developer or the manual-walkthrough approach starts missing real regressions.
- CI integration (tests run automatically on every push), once the project reaches a stage where that setup is worth the time (echoes the same future item noted in `Coding_Standards.md`).

## Questions

None currently open.
