# Administration

## Purpose

Defines the Administration module — the entry point that ties together every admin capability already established across other documents (user creation, device trust, roles/permissions, parental controls, Guardian's findings, technical monitoring) into one coherent screen. This document doesn't redefine those rules; it defines where they live in the app and who sees what. Deeper detail for the technical/monitoring side lives in `06_Admin` (Admin_Dashboard, Monitoring, Folder_Management, Logs, Internet_Access, Backup) — this document is the hub that routes to those.

## Goals

- Give admins one coherent place to manage the household, rather than scattering admin actions across unrelated screens.
- Make the Super Admin vs. scoped Admin distinction visually and functionally clear — a scoped Admin should never see technical tools or another child's settings that aren't theirs.
- Keep this document from duplicating the detailed rules already established elsewhere — it routes to them rather than re-explaining them.

## User Stories

- As the Super Admin, I want one place to manage users, devices, permissions, and system health.
- As a scoped Admin (Vee), I want to see only what's relevant to my account and my scoped child's account — not the full technical admin surface.
- As any admin, I want a clear, single starting point for parental controls, rather than hunting for where that lives.

## Features

- **Add User.** Entry point into the Super Admin-only account creation flow (per `Users.md`).
- **Device Management.** Add/revoke trusted devices (per `Security_Architecture.md`'s device trust model); requires the `manage_devices` permission (per `Authorization.md`). Full screen detail lives in `06_Admin/Folder_Management.md`'s sibling doc for devices, or a dedicated Device_Management section if split out later — for MVP, covered here as an entry point.
- **Roles & Permissions.** Assign role, admin_scope, and individually grantable permissions for any user (per `Authorization.md`) — Super Admin only for role/scope assignment; other individually grantable permissions may be delegated per the existing rules.
- **Folder Permissions.** Entry point to managing folder access and inheritance overrides (per `Folder_Permissions.md`); full detail in `06_Admin/Folder_Management.md`.
- **Parental Controls.** Entry point to the starter list already defined in `Security_Architecture.md` (e.g., "Approve Outside Calls" default-off for a child, notification on sensitive actions) — full future detail belongs in a dedicated Parental_Controls module, not built yet.
- **System Monitoring & Guardian Findings (Super Admin only).** Entry point to Guardian's passive and urgent findings (per `Guardian.md`), plus technical monitoring — backup status, disk space, sync status, device connectivity. Full detail lives in `06_Admin/Admin_Dashboard.md` and `06_Admin/Monitoring.md`.
- **Logs.** Entry point to security event logs (per `Security_Architecture.md`'s logging requirements — logins, permission changes, device changes, outside-call approvals/denials, blocked attempts). Full detail lives in `06_Admin/Logs.md`.
- **Backup Status.** Entry point to backup health (per `Security_Architecture.md`, `Guardian.md`'s system health monitoring). Full detail lives in `06_Admin/Backup.md`.
- **Internet Access Overview.** Entry point to reviewing outside-call activity across the household. Full detail lives in `06_Admin/Internet_Access.md`.

## Screen Layout

- **Super Admin view:** full Administration menu — Users, Devices, Roles & Permissions, Folder Permissions, Parental Controls, System Monitoring, Logs, Backup, Internet Access.
- **Scoped Admin view (Vee):** a reduced menu — only settings relevant to her own account and her scoped child/children (parental controls, activity logs for Malachi, folder permissions she manages) — no technical monitoring, no system-wide logs, no backup/internet-access tools, consistent with `Security_Architecture.md`'s existing MVP-only technical tools being Super Admin-exclusive.
- **Basic User:** no access to this module at all, beyond their own profile settings (which live in `Users.md`, not here).

## Data Stored

- No new entities — this module surfaces and routes to existing data (User, Device, Folder, AI_Suggestion/Guardian findings, security logs) already defined across `Data_Model.md` and the documents referenced above.

## AI Responsibilities

- No new AI behavior — this module is a navigation/control surface for admin actions and for reviewing Guardian's existing output, not a new AI capability.

## Permissions

- Access to this module at all requires an Admin or Super Admin role (per `Authorization.md`).
- Within the module, individual sections are further gated by specific permissions (`manage_devices`, `manage_folder_permissions`, `manage_parental_controls`, `view_child_activity_logs`) or are Super Admin-exclusive (role/scope assignment, technical monitoring, system-wide logs, backup, internet access overview) — no new permission concepts, all inherited from `Authorization.md`.

## Dependencies

- Builds on and routes to `Users.md`, `Security_Architecture.md`, `Authorization.md`, `Folder_Permissions.md`, `Guardian.md`, and every document in `06_Admin` once written.

## Future Enhancements

- A dedicated Parental_Controls module, expanding well beyond the current starter list.
- Possible further reduction of the scoped Admin's technical footprint as the system matures, though it's already minimal by design.

## Questions

None currently open.
