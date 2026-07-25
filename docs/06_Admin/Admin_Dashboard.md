# Admin Dashboard

## Purpose

Defines the Admin Dashboard — the landing screen an admin sees when they open the Administration module (`Administration.md`), analogous to how `Dashboard.md`/`Morning_Briefing.md` serve as the landing view for a regular family member, but scoped to admin concerns. This is where Guardian's passive and urgent findings (`Guardian.md`) actually surface, alongside a quick-glance system health summary and shortcuts into the rest of Administration.

## Goals

- Give an admin an immediate, at-a-glance picture of household/system health the moment they open Administration — not require them to hunt through separate screens.
- Make Guardian's urgent findings impossible to miss, consistent with the distinct visual treatment already established in `Notifications.md`.
- Keep the Super Admin and scoped Admin views appropriately different, matching the access split already defined in `Administration.md`.

## User Stories

- As the Super Admin, I want to open Administration and immediately see if anything urgent needs my attention.
- As the Super Admin, I want a quick system health summary (backups, disk space, sync status) without digging into Monitoring.
- As a scoped Admin (Vee), I want my version of this dashboard to show what's relevant to Malachi's account, not system-wide technical details I don't need.

## Features

- **Urgent alerts, front and center.** Guardian's urgent findings (per `Guardian.md`'s third output channel — backup failure, disk nearly full, etc.) display prominently at the top, using the distinct visual treatment (e.g., red) established in `Notifications.md`, so they're never mistaken for routine items.
- **Passive notifications feed.** Guardian's lower-priority, awareness-only findings (per `Guardian.md`'s first output channel — e.g., a blocked outside-call attempt) display below the urgent section, in normal styling.
- **Quick system health summary (Super Admin only).** A condensed view of backup status, disk space, sync status, and device connectivity (per `Guardian.md`'s system health monitoring list) — enough to answer "is everything okay?" at a glance, with a link into `06_Admin/Monitoring.md`'s fuller detail.
- **Shortcuts into Administration's other sections.** Quick links to Users, Devices, Roles & Permissions, Folder Permissions, Parental Controls, Logs, Backup, and Internet Access (per `Administration.md`'s full menu) — the Admin Dashboard is the hub these radiate from.
- **Scoped Admin view is reduced.** Vee's version of this screen shows Guardian findings relevant to Malachi's account (if any exist at that scope) and shortcuts limited to what `Administration.md` already grants her — no system-wide technical health summary, no urgent alerts that are Super-Admin-specific (e.g., backup failure isn't her concern).

## Screen Layout

- **Top:** Urgent alerts section (if any active) — visually distinct, impossible to miss.
- **Below:** Passive notifications feed, most recent first.
- **System health summary card (Super Admin only):** compact status indicators for backup, disk space, sync, device connectivity.
- **Shortcuts row/menu:** links into the rest of Administration's sections, per the admin's own access level (Super Admin vs. scoped Admin, per `Administration.md`).
- Layout stays scannable at a glance, consistent with the same "organized by section, not deep reading" principle used in `Dashboard.md` and `Morning_Briefing.md`.

## Data Stored

- No new entities — this screen composes existing data: Guardian findings/notifications (per `Guardian.md`, `Notifications.md`'s Notification entity with `severity`), and system health signals referenced in `Guardian.md`'s monitoring list. Full system health data storage (if any beyond live status checks) belongs to `06_Admin/Monitoring.md`, not duplicated here.

## AI Responsibilities

- No new AI behavior — this screen displays Guardian's existing output (per `Guardian.md`, `AI_Permissions.md`); it doesn't introduce new AI reasoning or generate anything itself.

## Permissions

- Full Admin Dashboard (urgent alerts, system health summary, all shortcuts): Super Admin only.
- Reduced Admin Dashboard (scoped findings, scoped shortcuts): scoped Admin, limited to their own account and scoped child/children, per `Administration.md`'s existing access model.
- No new permission concepts — inherited entirely from `Authorization.md` and `Administration.md`.

## Dependencies

- Builds on `Guardian.md` (findings and severity model), `Notifications.md` (urgent visual treatment), `Administration.md` (overall menu/access split), and `06_Admin/Monitoring.md` (fuller system health detail this screen links out to).

## Future Enhancements

- Customizable dashboard ordering/widgets for admins, similar to the customization future items already noted for the regular family Dashboard.
- Richer system health visualizations as `06_Admin/Monitoring.md` matures.

## Questions

None currently open.
