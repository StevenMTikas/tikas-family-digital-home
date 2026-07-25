# System Overview

## Purpose

Describes Tikas Family Digital Home end-to-end — the major components, how they connect, who uses them, and how data and AI responsibility flow through the system. Emphasis is on the MVP as it will actually be built and run in the household today. Anything not covered by a module already listed in the project structure is out of scope and belongs in `Future_Ideas.md`.

## Goals

- Give a single, accurate picture of the system that every other architecture and module doc can build on.
- Make the boundary between "inside the home" and "outside the home" explicit, since that boundary is central to the project's privacy principles.
- Reflect the real hardware this will run on (one host computer, three connector devices, three phones) rather than a hypothetical deployment.

## System at a Glance

Tikas Family Digital Home is a **self-hosted, local-first system**. One computer in the home acts as the host — running the app, the database, and the local AI model, effectively all the time (barring power outages). Every other device in the family — other computers and phones — runs a lightweight **connector** that indexes local files and feeds relevant data back to the host. All AI processing, storage, and decision-making happens on the host, inside the home, by default. The system only reaches outside the home when explicitly asked to, and only after approval.

## Components

### 1. Host Application (runs on Dad's computer)
- **Frontend:** React + Next.js + Tailwind, delivered as a PWA — accessible from any device on the family's private network.
- **Backend:** Next.js API routes on Node.js — the single point of coordination for all modules.
- **Database:** SQLite — stores family data (users, calendar, tasks, documents, photos, memory, family knowledge).
- **AI Engine:** Ollama, running an open-source model locally — this is the default and primary AI for the system. All AI reasoning happens here.
- **Vector Search:** ChromaDB or SQLite-based vector search — indexes documents/knowledge for semantic search and AI retrieval (final choice pending, see `Decision_Log.md`).
- **Admin Layer:** technical monitoring (uptime, backups, logs, disk space) and family-facing controls (parental controls, child monitoring). Both live together in the MVP; the technical side is specific to self-hosting and would not exist in a future commercial/hosted version.

### 2. Connectors (run on the other two computers, and on all three phones)
- Lightweight local agents — "mini indexers." They scan their device's local files and report relevant metadata back to the host.
- Connectors do not run AI or make decisions locally — all reasoning stays on the host. Connector = scanner, host = brain.
- Connectors sync to the host on a **scheduled basis, once per day for MVP** — not continuously and not on retry. If the host is unreachable at sync time, the connector does not retry; it simply waits for the next scheduled sync.
- Phone-based connectors are included in the MVP, not deferred, since day-to-day use — especially Vee's — happens largely from a phone.

### 3. The Boundary of the Home
- Everything above is contained within the home network by default: the host, the database, the AI model, and every connector.
- The app itself is allowed to view the host computer's files and connected devices' indexed data.
- The system may reach outside the home (e.g., an external API call, a cloud lookup) **only when a specific action requires it, and only after the user explicitly approves that specific call.** There is no standing, always-on connection to the outside internet for AI or data purposes.
- Remote access for family members (using the app while away from home) goes through a private network layer (e.g., Tailscale) rather than exposing the host directly — see `Security_Architecture.md`.

## Users

| Person | Role | Access Level |
|---|---|---|
| Dad | Super Admin | Full technical and family admin access |
| Vee | Admin (scoped) | Full admin access for anything related to Malachi (parental controls, child monitoring); standard access otherwise |
| Malachi (15) | Basic User | Standard family member access, subject to Vee/Dad's parental controls |

The AI itself acts as a system-level participant, not a "user" — see AI Responsibilities below.

## Devices (MVP)

- **3 computers** — one per family member. Dad's is the host; Vee's and Malachi's run connectors.
- **3 phones** — one per family member, each running a phone-based connector, included in the MVP so the full basic system can be tested end-to-end by the whole family, not just Dad.

## Data (High Level)

Initial supported file types: **basic Office files and PDF.**
Future file types (e.g., CAD, STL for 3D printing) are noted in `Future_Ideas.md` — explicitly out of scope for MVP.

Data flowing through the system includes: user/family profiles, calendar events, tasks, documents, photos, memories, family knowledge, and notifications.

Within the family's permission structure, **anything is fair game for the AI to use** — there is no category of data walled off from the AI by default; access is governed entirely by the permissions each user already has (see `04_Permissions`).

## AI Responsibilities

The AI is built into each module as a background capability, not a standalone feature — it should never be the focal point of a screen. It:

- Runs locally via Ollama by default, on the host.
- Acts autonomously in specific, bounded ways: the **Guardian** monitors system/family health in the background, and the **Dashboard** generates per-family-member suggestions based on usage patterns and information gathered from files and other data sources.
- Otherwise responds to direct requests through the Assistant/Advisor roles.
- Never makes an outbound call beyond the home network without asking for and receiving explicit approval first. Any user can grant this approval, but only if they hold the specific **"Approve Outside Calls"** permission — a permission that is off by default and must be explicitly granted to a user by a family admin at account setup or later, not something every user has automatically.

## Permissions

- **Super Admin (Dad):** full technical and family-level control.
- **Admin, scoped (Vee):** full control over Malachi's account/data (parental controls, monitoring); standard user elsewhere.
- **Basic User (Malachi):** standard access, subject to the parental controls Vee/Dad configure.
- Folder- and data-level permissions apply equally to human users and to the AI — the AI cannot see what its acting user isn't permitted to see.
- **Approve Outside Calls** is a distinct, opt-in permission, separate from role (Admin/Basic User). It is off by default for every account and must be explicitly granted by a family admin when an account is set up or updated.

Full detail lives in `04_Permissions`.

## Dependencies

- Depends on the full stack defined in `Technology_Stack.md`.
- Depends on the host computer remaining the always-on machine; connectors and phones depend on the host being reachable (locally or via the private remote-access network) **at their scheduled sync time** — currently once per day for MVP. A missed sync is not retried; data simply arrives with the next scheduled sync.

## Future Enhancements

- Support for additional file types (CAD, STL, and others relevant to 3D printing).
- A commercial/hosted version of the Admin module that drops the technical self-hosting controls (backups, logs, monitoring) that only make sense for a self-hosted MVP.
- Anything not represented in the current module list — logged in `Future_Ideas.md` as it comes up.

## Questions

- Should the private remote-access layer (e.g., Tailscale) be considered part of the Host Application component, or documented purely in `Security_Architecture.md` and just referenced here?
