# API Reference

## Purpose

Establishes the conventions the internal API follows — URL patterns, authentication, request/response shape, and error handling — so every module implements its routes consistently. This document does **not** list final, real endpoints yet, since no module has been built. It defines the pattern each module will follow, and gets filled in with actual routes as each module is implemented. Treat the "Module Route Skeletons" section as a to-be-confirmed outline, not a spec.

## Goals

- One consistent convention for every module's API, so a developer who learns one module's routes already understands the shape of every other module's routes.
- Avoid inventing endpoint details that don't exist yet — this document should only ever describe what's actually true or what's an intentional, agreed convention.
- Stay in sync with `Application_Architecture.md` (route/folder structure) and `Data_Model.md` (entities each module's routes will operate on).

## Conventions

### URL Pattern: Standard REST

Routes follow standard REST conventions, scoped under `/app/api/<module>`, per `Application_Architecture.md`:

| Action | Pattern | Example |
|---|---|---|
| List / read all | `GET /api/<module>` | `GET /api/tasks` |
| Read one | `GET /api/<module>/:id` | `GET /api/tasks/42` |
| Create | `POST /api/<module>` | `POST /api/tasks` |
| Update | `PATCH /api/<module>/:id` | `PATCH /api/tasks/42` |
| Delete | `DELETE /api/<module>/:id` | `DELETE /api/tasks/42` |

The **Connector API** (`/app/api/connectors`) is separate and does not follow this same resource-per-module pattern — see `File_Connector_Architecture.md` for its purpose; its specific routes are similarly TBD until built.

### Authentication

- Every request (except login itself) requires an authenticated session, per `Security_Architecture.md` (username/password, persistent session on trusted devices).
- Routes do not accept requests from unauthenticated sessions or untrusted/revoked devices.

### Permission Checks

- Every route checks the requesting user's permissions via `/lib/core/permissions` (per `Application_Architecture.md`) before performing any action — this is not optional per-route logic, it's a shared gate every module route calls through.

### Request/Response Shape

- Standard JSON request and response bodies.
- **Errors** follow one common shape across every route, per `Application_Architecture.md`:
  ```json
  { "error": { "code": "...", "message": "..." } }
  ```
  This lets the shared frontend API client (`/lib/api`) handle errors generically instead of per-module.

### AI-Involved Routes

- Any route that triggers an AI action (Assistant, Advisor, Guardian) routes through the central `/lib/core/ai` service rather than calling Ollama directly — per `AI_Architecture.md`. This includes the same permission and outside-call-approval checks as any other AI interaction.

## Module Route Skeletons (To Be Confirmed)

The following reflects the entities already defined in `Data_Model.md`, expressed as standard REST resources per the convention above. **These are not finalized endpoints** — they're the expected shape based on current documentation, to be confirmed and detailed as each module is actually built.

| Module | Primary Resource(s) | Notes |
|---|---|---|
| Users | `/api/users` | Includes Device sub-resource per user |
| Calendar | `/api/calendar` (Events) | Event_Assignment (multi-user) handled as part of Event create/update |
| Tasks | `/api/tasks` | |
| Documents | `/api/documents` | Folder-scoped permissions apply |
| Photos | `/api/photos` | Tagging endpoints TBD |
| Memory | `/api/memory` | Memory_Photo relationship TBD |
| Family Knowledge | `/api/family-knowledge` | Folder-scoped permissions apply |
| Notifications | `/api/notifications` | Real-time delivery mechanism TBD (not simple REST) |
| Administration | `/api/administration` | Covers device trust, permissions, parental controls, logs |

Email, Voice, and AI-specific routes (Assistant/Advisor/Guardian direct endpoints) are not yet outlined here — their shape depends on decisions still to be made in their respective module docs.

## Dependencies

- Builds on and must stay consistent with `Application_Architecture.md`, `Data_Model.md`, `Security_Architecture.md`, `AI_Architecture.md`, and `File_Connector_Architecture.md`.

## Future Enhancements

- Replace the "Module Route Skeletons" table with real, documented endpoints as each module is implemented — this is expected to happen incrementally, not all at once.
- Add request/response examples per real endpoint once they exist.
- Document any rate-limiting or throttling conventions if they become necessary.

## Questions

- Should this document be updated module-by-module as each is built (living document, like `Data_Flow.md`), or filled in all at once after all modules are designed? I'd lean toward incremental, same reasoning as Data_Flow — but wanted to confirm since it changes how "done" this doc ever is.
