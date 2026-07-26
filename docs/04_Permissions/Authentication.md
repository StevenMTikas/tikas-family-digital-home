# Authentication

## Purpose

Defines how users log into Tikas Family Digital Home and how their sessions are managed. This formalizes the authentication decisions already made in `Security_Architecture.md`, scoped specifically to the login mechanism itself — permission logic beyond login lives in `Folder_Permissions.md`, `AI_Permissions.md`, and `Security_Architecture.md`.

**Corrected 2026-07-26:** this document previously described login itself as device-gated (only a Super-Admin-approved device could reach a working login form at all). That was never actually consistent with `Security_Architecture.md`'s own Device Trust section, which scopes device trust specifically to **file-connector devices** and explicitly states "device trust is separate from user login." The MVP as built matches `Security_Architecture.md`: login is username/password only, with no per-browser device check. See Future Enhancements below — real device-gated login is still a genuine planned feature, just not an MVP requirement.

## Goals

- Keep login simple and appropriate for a closed, home-based family system — not over-engineered with enterprise-grade auth features it doesn't need.
- Rely on the household's private network layer (Tailscale, per `Security_Architecture.md`/`Decision_Log.md` #002) as the actual access boundary for MVP, rather than an additional per-device login gate.

## User Stories

- As a family member, I want to log in with a simple username and password so I can access the Digital Home without friction.
- As a family member, I want to stay logged in indefinitely on my own device so I don't have to re-enter my password every time.
- As the Super Admin, I want to be the only one who can reset a forgotten password, since there's no external recovery flow.

## Features

- Username and password login — no device-level gate in front of it for MVP.
- **Indefinite sessions** — no forced re-authentication once logged in.
- **No lockouts** on repeated failed login attempts for MVP — not needed given the closed, home-network-only nature of the system.
- **No self-service password recovery.** Only the Super Admin can reset a password, done manually from the Admin Dashboard.

## Screen Layout

- A single login screen with two fields: **username** and **password**.
- No "remember me" toggle — sessions persist indefinitely by default, so the toggle would be redundant.
- No "forgot password" link/flow — recovery is handled out-of-band by the Super Admin per Features above.

## Data Stored

- Uses the **User** entity from `Data_Model.md` (username, password_hash) to authenticate. Does not consult the **Device** entity — that table backs file-connector authentication (`File_Connector_Architecture.md`) and the read-only "My Devices" list (`Users.md`), not login eligibility.
- No new entities introduced by this document.

## AI Responsibilities

- None. Authentication is a non-AI gate that happens before any AI interaction — every scenario in `Data_Flow.md` assumes the user is already authenticated by this point.

## Permissions

- Authentication itself doesn't grant differentiated permissions — it only establishes *who* is logged in. What that person can then do is governed by `Authorization.md`, `Folder_Permissions.md`, and `AI_Permissions.md`.

## Dependencies

- Builds directly on `Security_Architecture.md` (password reset policy) and `Data_Model.md` (User entity).
- Feeds into `Authorization.md` (what a logged-in user can do) and `User_Flows.md` (the actual login experience/screens).

## Future Enhancements

- **Real device-gated login** — a genuine planned feature, not just an MVP gap: identify the browser/device attempting to log in and block anything not explicitly approved by the Super Admin, independent of network-layer access (Tailscale). Should be treated as a requirement (not optional polish) before any commercial/multi-household release, since a shared/public network model can't rely on "only people with Tailscale access can reach this at all" the way this single household's MVP does.
- Self-service or email-based password recovery, if the system ever gains a way to reach users outside the app itself (noted as a future item in `Security_Architecture.md` as well).
- Failed-login lockout or throttling, if the system ever becomes reachable outside a fully closed home network.

## Questions

None currently open.
