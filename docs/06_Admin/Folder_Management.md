# Folder Management

## Purpose

Defines the admin-facing Folder Management screen — where the granular view/edit/delete permissions, nesting/inheritance rules, and the shared family folder (all already defined in `Folder_Permissions.md`) are actually managed. This document is the screen; `Folder_Permissions.md` remains the source of truth for the underlying rules.

## Goals

- Give whoever holds "Manage Folder Permissions" a clear, usable screen for granting and adjusting access — not just a rule set with no interface.
- Make the Super Admin-only inheritance override capability clearly distinct from routine permission granting, so it's not mistaken for something any permission-holder can do.
- Make the folder tree (nesting) genuinely easy to navigate, since permissions can vary at every level.

## User Stories

- As someone with "Manage Folder Permissions," I want to see a folder's current access list and adjust it without needing to be its original owner.
- As the Super Admin, I want a clear, distinct way to override a subfolder's inherited permissions when needed.
- As an admin, I want to see at a glance whether a folder is inheriting its permissions or has an override applied.

## Features

- **Folder tree navigation.** A browsable, nested view of the folder structure (per `Folder_Permissions.md`'s nesting model), so an admin can find and select any folder or subfolder directly.
- **Per-folder permission editor.** For a selected folder, view and edit View/Edit/Delete grants per user or role (per `Folder_Permissions.md`'s granular model).
- **Inheritance indicator.** Each folder clearly shows whether it's inheriting permissions from its parent or has an override applied — no ambiguity about where a folder's current access actually comes from.
- **Override control (Super Admin only).** A distinct, clearly separated action for breaking a subfolder's inheritance and setting it independently — visually and functionally separate from the routine permission-granting available to any "Manage Folder Permissions" holder, consistent with `Folder_Permissions.md`'s rule that only the Super Admin can do this.
- **Shared family folder, clearly marked.** The one built-in whole-family folder (per `Folder_Permissions.md`) is visually distinguished in the folder tree, so it's obviously the deliberate shared-by-default exception rather than just another folder.
- **Who can grant access:** anyone holding "Manage Folder Permissions" can adjust a folder's access — not limited to that folder's owner, per `Folder_Permissions.md`'s existing rule.

## Screen Layout

- **Left/top: folder tree**, nested, with the shared family folder visually marked near the top.
- **Main panel, per selected folder:**
  - Inheritance status (inheriting from parent / override applied).
  - Permission table: user/role × View/Edit/Delete grants.
  - Override control, visually separated and only visible/enabled for the Super Admin.

## Data Stored

- No new entities — this screen is the management interface for the existing **Folder** entity's `permissions`, `inherits_permissions`, and `is_shared_family_folder` fields (per `Data_Model.md`, `Folder_Permissions.md`). No schema changes required.

## AI Responsibilities

- None — this is a pure admin management screen with no AI involvement of its own. The AI's own use of folder permissions (per `AI_Permissions.md`) is governed by the same underlying data this screen manages, but this screen doesn't add any new AI behavior.

## Permissions

- **View/edit folder permissions:** requires "Manage Folder Permissions" (per `Authorization.md`) — not limited to a folder's owner.
- **Override inheritance:** Super Admin only, per `Folder_Permissions.md`'s existing rule — enforced here as a functionally separate action, not just a more prominent button.

## Dependencies

- Builds entirely on `Folder_Permissions.md` (the rules this screen implements) and `Data_Model.md`'s Folder entity — no new rules introduced here, only the interface for existing ones.

## Future Enhancements

- Bulk permission changes across multiple folders/subfolders at once, if managing a growing folder tree one-by-one proves tedious.
- Auto-generated default folder structure per user role (already noted as a commercial-version item in `Folder_Permissions.md`) would likely need a corresponding "reset to default" control here.

## Questions

None currently open.
