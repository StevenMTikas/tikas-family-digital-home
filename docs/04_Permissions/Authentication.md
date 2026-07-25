# Authentication

## Purpose

Defines how users log into Tikas Family Digital Home and how their sessions are managed. This formalizes the authentication decisions already made in `Security_Architecture.md`, scoped specifically to the login mechanism itself — device trust and permission logic beyond login live in `Folder_Permissions.md`, `AI_Permissions.md`, and `Security_Architecture.md`.

## Goals

- Keep login simple and appropriate for a closed, home-based family system — not over-engineered with enterprise-grade auth features it doesn't need.
- Make device trust a hard requirement for login, not just a convenience layer, so the system is only ever accessible from devices the Super Admin has explicitly approved.

## User Stories

- As a family member, I want to log in with a simple username and password so I can access the Digital Home without friction.
- As a family member on a trusted device, I want to stay logged in indefinitely so I don't have to re-enter my password every time.
- As the Super Admin, I want the system to only be accessible from devices I've explicitly added, so an unknown or unapproved device can never reach it.
- As the Super Admin, I want to be the only one who can reset a forgotten password, since there's no external recovery flow.

## Features

- Username and password login.
- **Device-gated access:** the login screen itself is only reachable/functional from a device already added and trusted by the Super Admin (per `Security_Architecture.md`'s device trust model). A device that hasn't been added by an admin cannot log in at all — this isn't a reduced/guest experience, it's a hard block.
- **Indefinite sessions** on trusted devices — no forced re-authentication once logged in.
- **No lockouts** on repeated failed login attempts for MVP — not needed given the closed, device-gated nature of the system.
- **No self-service password recovery.** Only the Super Admin can reset a password, done manually from the Admin Dashboard.

## Screen Layout

- A single login screen with two fields: **username** and **password**.
- No "remember me" toggle — trusted devices stay logged in by default, so the toggle would be redundant.
- No "forgot password" link/flow — recovery is handled out-of-band by the Super Admin per Features above.
- If accessed from a non-trusted device, the screen (or the request before it ever reaches a screen) simply denies access rather than presenting a functional login form. Exact denial messaging is a UX detail for `User_Flows.md`.

## Data Stored

- Uses the **User** entity from `Data_Model.md` (username, password_hash) and the **Device** entity (linked to a User, trusted/revoked status) to determine login eligibility.
- No new entities introduced by this document.

## AI Responsibilities

- None. Authentication is a non-AI gate that happens before any AI interaction — every scenario in `Data_Flow.md` assumes the user is already authenticated by this point.

## Permissions

- Authentication itself doesn't grant differentiated permissions — it only establishes *who* is logged in. What that person can then do is governed by `Authorization.md`, `Folder_Permissions.md`, and `AI_Permissions.md`.
- Device trust (who can even reach the login screen) is managed exclusively by the Super Admin, per `Security_Architecture.md`.

## Dependencies

- Builds directly on `Security_Architecture.md` (device trust, password reset policy) and `Data_Model.md` (User, Device entities).
- Feeds into `Authorization.md` (what a logged-in user can do) and `User_Flows.md` (the actual login experience/screens).

## Future Enhancements

- Self-service or email-based password recovery, if the system ever gains a way to reach users outside the app itself (noted as a future item in `Security_Architecture.md` as well).
- Reduced-trust/guest access from a non-admin-added device, if a future use case requires it (e.g., a visiting relative) — explicitly not supported in MVP.
- Failed-login lockout or throttling, if the system ever becomes reachable outside a fully closed home network.

## Questions

None currently open.
