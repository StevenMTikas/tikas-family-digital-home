# Users

## Purpose

Defines the Users module — profile self-editing, how the Super Admin creates new accounts, what family members can see about each other, and how users view (but not manage) their own devices. The underlying User entity, roles, and permission rules already exist in `Data_Model.md`, `Authorization.md`, and `Security_Architecture.md`; this document covers the actual screens and day-to-day experience built on top of them.

## Goals

- Let family members manage their own personal info without needing an admin for routine changes.
- Keep account creation, role/permission changes, and device management admin-controlled, consistent with `Authorization.md`.
- Make basic family visibility (who's who) available to everyone, while keeping account-level control tightly scoped to admins.

## User Stories

- As a family member, I want to update my own profile info (photo, hobbies, contact info) without asking an admin.
- As the Super Admin, I want a simple way to add a new family member's account, setting up their initial login.
- As a family member, I want to see basic profile info for the rest of my family, so the app feels like it reflects the whole household.
- As a family member, I want to see which devices are linked to my account, even though I can't add or remove them myself.

## Features

- **Self-editable profile fields:** full name, photo, contact info, hobbies/interests — a user can update these about themselves at any time.
- **Admin-only fields:** username, password, role, admin_scope, and all individually grantable permissions (per `Authorization.md`) — never editable by the user themselves, only by an admin with the appropriate authority.
- **Add User flow (Super Admin only):** the Super Admin fills out a new account's required information (name, relationship, date of birth, initial username/password, role) to create the account. The new family member then logs in with those initial credentials (per `Authentication.md`).
- **Family visibility:** any family member can view basic profile info (name, photo, relationship, hobbies/interests) for every other family member — this is a "who's who" view, not a private one.
- **Device view (read-only for the user):** a user can see the device(s) linked to their own account, but cannot add, remove, or edit them — that remains admin-only, managed through the Administration module (per `Security_Architecture.md`'s device trust model).
- **Activity tab (2026-10-25):** the surface for the `view_child_activity_logs` permission (`Authorization.md`). Shown only to someone with someone to look at — the Super Admin (everyone else) or an Admin granted that permission (their scoped child/children). A recent-activity list per person: logins, outside-call attempts and decisions, saved-password views, and document upload/download/delete. Deliberately an allowlist: Assistant conversations are not shown (they stay private apart from Guardian's narrow safety signal, `Guardian.md`), and location stays Super-Admin-only (`Location_Tracking.md`). Distinct from the Super-Admin-only full security log (`Logs.md`).
- **Add Connection tab (2026-08-02):** a launcher for outside-account connections the user can make themselves (currently just Email, `Email.md`) — closes a real gap where `/email` had no link anywhere in the app. Visible to every user, not just admins, since connecting one's own account needs no elevated permission (`Email.md`'s Standing Integration Connection model). A plain link out to each connection's own dedicated page, not an embedded connect form.

## Screen Layout

- **My Profile:** shows and allows editing of self-editable fields (photo, contact info, hobbies/interests); shows admin-only fields as read-only display. Also includes a "Document Categories" section (2026-07-30) — visible to everyone as a plain list, with rename/delete controls shown only for the Super Admin (see `Documents.md`).
- **My Devices:** a simple list of the device(s) linked to this account (device name/type, trusted status) — view-only, with a note that device changes must go through an admin.
- **Family Members:** a list/grid of all family members showing basic profile info (name, photo, relationship, hobbies/interests) — viewable by anyone.
- **Add Connection:** a card per available connection type (currently one: Email) linking out to its own page — see Features above.
- **Add User (Super Admin only):** a form covering the fields needed to create a new account (per Data Stored below), visible only to the Super Admin.

## Data Stored

Uses the existing **User** entity from `Data_Model.md` and `Authorization.md` — no new fields required. For reference, the self-editable vs. admin-only split:

| Field | Editable by |
|---|---|
| full_name, photo, contact_info, hobbies_interests | The user themselves |
| username, password, role, admin_scope, approve_outside_calls, manage_devices, manage_parental_controls, view_child_activity_logs, delete_content, manage_folder_permissions, approve_sensitive_outside_transmission | Admin only (per `Authorization.md`'s existing rules) |
| relationship, date_of_birth | Set at account creation by the Super Admin; not expected to change routinely, so treated as admin-only for MVP |

Device information displayed here reads from the existing **Device** entity (`Data_Model.md`) — this module doesn't introduce new device fields, only a read-only view of what's already there.

## AI Responsibilities

- None directly. The AI reads from User profile fields (e.g., hobbies_interests) for personalization purposes elsewhere (per `AI_Architecture.md`), but this module itself is a straightforward CRUD/profile experience with no AI involvement of its own.

## Permissions

- **Self-editing:** every user can edit their own self-editable fields; no special permission required.
- **Add User / role / permission changes:** Super Admin only (per `Authorization.md` — role/scope assignment is inherently Super Admin-only).
- **Family visibility:** open to all family members by default — no folder or permission gate on basic profile info.
- **Device management (add/remove/edit):** requires the `manage_devices` permission (per `Authorization.md`), exercised through the Administration module, not this one. Viewing your own devices requires no special permission.

## Dependencies

- Builds on `Data_Model.md` (User, Device entities), `Authorization.md` (role/permission model, field-level edit rules), `Authentication.md` (initial login credentials), and `Security_Architecture.md` (device trust model).
- Feeds into `06_Admin/Folder_Management.md` and the broader Administration module for the actual device add/remove screens.

## Future Enhancements

- Self-service editing of relationship/date_of_birth, if that proves overly restrictive in practice.
- Richer family visibility (e.g., a "what's everyone up to" summary), possibly folded into the Family Dashboard (`Dashboard.md`) rather than this module.

## Questions

None currently open.
