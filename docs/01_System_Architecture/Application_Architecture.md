# Application Architecture

## Purpose

Defines how the Tikas Family Digital Home codebase is organized and how its parts communicate — the technical "how," as opposed to `System_Overview.md`'s "what and why." This is the document a developer (including future you) opens to understand where code lives and how a request flows through the system.

## Goals

- Keep the codebase structure a direct mirror of the module documentation, so there's never a translation step between "which doc covers this" and "which folder covers this."
- Minimize duplicated code for cross-cutting concerns (permissions, AI, logging) without making modules dependent on each other.
- Default to the simplest option the stack offers before reaching for an extra dependency.

## Routing: App Router

Next.js **App Router** (`app/` directory) is used, not the older Pages Router. This is the current Next.js standard, has better native support for Server Components (reducing how much client-side state management is needed), and fits PWA setup cleanly.

## Top-Level Project Structure

The codebase mirrors the module list from the project documentation directly:

```
/app
  /dashboard
  /users
  /calendar
  /tasks
  /documents
  /photos
  /memory
  /family-knowledge
  /email
  /voice
  /notifications
  /administration
  /api
    /calendar
    /tasks
    /documents
    /photos
    /memory
    /family-knowledge
    /notifications
    /administration
    /connectors          # separate internal API, see below
/lib
  /api                    # thin typed client functions, one file per module
  /core
    /permissions          # shared permission-check service
    /ai                   # central AI service (see AI Integration below)
    /logging              # shared security/event logging service
/components               # shared, reusable UI components (buttons, layout, etc.)
/db                        # SQLite schema, migrations, connection
```

A module's folder under `/app/<module>` and its API route under `/app/api/<module>` are the two places a developer needs to look to understand that entire feature — matching the "modular, understandable, removable on its own" principle.

## Frontend ↔ Backend Communication

- The frontend calls a **thin shared API client** (`/lib/api/<module>.ts`) rather than calling `fetch` directly from components. Each module gets one client file with typed functions (e.g., `getEvents()`, `createTask()`).
- This keeps fetch/error-handling logic in one place per module instead of duplicated across every screen that needs it, while staying lightweight — no additional library required.

## State Management

- **No global state library** (e.g., Redux, Zustand) for MVP. The stack doesn't need one yet, and adding one would be unnecessary dependency weight.
- **Server Components** handle most data fetching natively, directly from the database/API layer.
- **React Context** covers the small amount of true global client-side state — primarily the logged-in user's session and active notifications.
- This can be revisited in `Decision_Log.md` if a real need for more sophisticated state management emerges later.

## Backend Structure: Modules + Shared Core Services

Each module (Calendar, Tasks, Documents, etc.) owns its own:
- API routes (`/app/api/<module>`)
- Business logic specific to that feature
- Database access specific to that feature's own tables

But every module routes through shared **core services** in `/lib/core` for anything that must behave identically everywhere, rather than reimplementing it per module:

- **`/lib/core/permissions`** — the single place permission checks happen (folder permissions, role checks, the "can this user approve sending this data outside?" scoping rule from `Security_Architecture.md`). Every module calls this rather than writing its own permission logic.
- **`/lib/core/ai`** — the central AI service (see below).
- **`/lib/core/logging`** — the single place security events get recorded (logins, permission changes, device changes, outside-call approvals — per `Security_Architecture.md`'s logging requirements).

This hybrid keeps each module independent and removable for its actual feature logic, while eliminating duplicated code for the things that must be consistent across the whole system.

## AI Integration

- Modules do **not** call Ollama directly.
- Every module routes AI requests through the central **`/lib/core/ai`** service, which:
  - Talks to Ollama on the host.
  - Enforces the outside-call approval flow (`Security_Architecture.md`) if a request would require reaching outside the home network.
  - Applies permission scoping via `/lib/core/permissions` before the AI can access any data.
  - Logs the interaction via `/lib/core/logging`.
  - Records `AI_Suggestion` entries (per `Data_Model.md`) when the AI proactively generates a suggestion, and captures thumbs up/down feedback against them.
- This keeps AI behavior — and the security rules around it — consistent no matter which module triggered it, and avoids duplicating approval/logging logic in every module.

## Connector Communication

- Connectors (running on the other two computers and all three phones) do **not** use the same API routes as the main frontend.
- They talk to a **separate, internal Connector API** (`/app/api/connectors`), purpose-built for the simple, scheduled sync job connectors perform (once per day for MVP, per `System_Overview.md`).
- Keeping this API separate from the main application API means the connector protocol can stay minimal and doesn't get entangled with — or complicated by — the full frontend's API surface.

## Error Handling & Conventions (Proposed Defaults)

- **Consistent error shape:** all API routes return errors in a single common shape (e.g., `{ error: { code, message } }`), so the frontend API client can handle errors generically instead of per-module.
- **Centralized logging of failures:** unexpected errors are logged through `/lib/core/logging`, the same service used for security events — one place to look when something breaks.
- **Fail loud, not silent** (per `Cursor_Project_Rules.md`): a failed sync, AI call, or permission check surfaces to the user or admin rather than failing quietly.
- **Testing:** lightweight — prioritize tests for the shared core services (`permissions`, `ai`, `logging`) first, since bugs there have the widest blast radius; module-level tests as time allows. Full detail belongs in `Testing.md`.
- These are proposed starting conventions — final detail belongs in `Coding_Standards.md` and `Testing.md` once written.

## Data Flow: Typical Request

1. A family member's browser (PWA) requests a page under `/app/<module>`.
2. Server Components fetch data directly where possible; client-side interactions call `/lib/api/<module>` functions.
3. Those functions call the module's own API route under `/app/api/<module>`.
4. The route checks permissions via `/lib/core/permissions`, performs its module-specific logic, and (if AI is involved) calls `/lib/core/ai`.
5. The AI service applies its own permission and outside-call approval checks before touching Ollama or requesting outside access.
6. Results return to the frontend; any security-relevant step along the way is logged via `/lib/core/logging`.

## Dependencies

- Builds on `Technology_Stack.md`, `System_Overview.md`, `Security_Architecture.md`, and `Data_Model.md`.
- Feeds into `Coding_Standards.md`, `Testing.md`, and `API_Reference.md` once written.

## Future Enhancements

- Introduce a proper state management library only if Server Components + Context prove insufficient as the app grows.
- Expand the Connector API if connector sync needs become more complex than a daily scheduled pull.
- Formalize `API_Reference.md` with the actual route contracts once modules are implemented.

## Questions

- Should `/lib/core/ai`'s outside-call approval prompt be a blocking UI modal (user must respond before continuing), or can it queue as a notification the user answers on their own time?
- For the Connector API — should it require the same device-trust check (per `Security_Architecture.md`) on every single sync, or authenticate once and trust the session until revoked?
