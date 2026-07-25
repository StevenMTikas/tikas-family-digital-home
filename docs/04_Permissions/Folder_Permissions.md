# Folder Permissions

## Purpose

Defines how folders work as the permission boundary for Documents and Family Knowledge items — structure (nesting, inheritance), granularity (view/edit/delete), and who can manage access. This is the detailed design behind the `Folder` entity introduced in `Data_Model.md` and the folder-based approval scoping rule in `Security_Architecture.md`.

## Goals

- Make folder permissions granular enough to be genuinely useful (view/edit/delete, not just an all-or-nothing switch), without becoming so complex that a family member managing them gets confused.
- Support nested folders with sensible default inheritance, while still giving the Super Admin full override control per folder when needed.
- Establish a default shared space (the whole-family folder) so not everything requires manual setup from day one, even though full default folder structures are a commercial-version feature.

## User Stories

- As a family member, I want folders I can organize documents into, including subfolders, so my content stays organized the way I think about it.
- As the Super Admin, I want to override a subfolder's inherited permissions when a more restrictive (or more open) setting is needed for that specific subfolder.
- As an admin, I want to grant view, edit, or delete access separately, so I can let someone see a document without letting them change or remove it.
- As a family member, I want a shared "whole family" folder that everyone can already see by default, without needing it set up manually.

## Features

### Nesting & Inheritance

- Folders can contain **subfolders** — full nested structure, not flat.
- **Permissions inherit downward by default.** A subfolder starts with the same permissions as its parent folder.
- **The Super Admin can override inherited permissions on any specific subfolder**, setting it more restrictive or more open than its parent, independent of what the parent folder allows.
- Only the Super Admin can override inheritance for MVP — this is not a capability given to scoped Admins or "Manage Folder Permissions" holders (see Permissions below).

### Manual Creation (MVP) vs. Default Structure (Future)

- For MVP, **every folder is created manually**, with permissions set explicitly at creation time. There is no auto-generated starting folder structure per user.
- **Future (commercial) enhancement:** auto-create a default folder structure per user based on their role/user level when their account is created (e.g., a private personal folder, relevant shared folders already in place) — not built for MVP, noted here so it isn't lost.

### Granular Permissions: View / Edit / Delete

Each folder's permissions are set per user (or role) across three separate levels, not a single access toggle:

| Level | Meaning |
|---|---|
| **View** | Can see the folder and its contents. |
| **Edit** | Can add/modify content within the folder. Implies View. |
| **Delete** | Can remove content from the folder. Implies View and Edit — tied to the `delete_content` permission defined in `Authorization.md`, but scoped specifically to what this folder allows. |

A user can, for example, have View + Edit on a folder without Delete — able to add and update documents, but not remove them.

### Shared "Whole Family" Folder

- A built-in folder exists by default that **every family member can view** — intended for the kind of content described in `Family_Knowledge.md`'s "safety deposit box" concept (shared contact info, shared streaming passwords, etc.).
- This folder's default permissions are View for all family members; Edit/Delete on it follow the same granular model above and are set explicitly (e.g., likely Admins/Super Admin have Edit/Delete, Basic Users have View only, but this is configurable).
- All other folders remain private/explicitly permissioned — the shared family folder is the one deliberate exception to "nothing is shared by default."

## Screen Layout

- Folder structure and permissions are managed within the **Documents** and **Family Knowledge** modules, and reviewable/overridable from the **Administration** module for admin-level changes.
- A folder's permission settings should show, per user or role: View / Edit / Delete, and whether the folder is inheriting from its parent or has an override applied.

## Data Stored

Extends the **Folder** entity from `Data_Model.md`:

| Field | Notes |
|---|---|
| id | |
| name | |
| owner_id | |
| parent_folder_id | null for top-level folders; enables nesting |
| inherits_permissions | boolean — true by default for subfolders |
| permissions | per-user or per-role View/Edit/Delete grants; explicit values here override inheritance when `inherits_permissions` is false or an override has been applied |
| is_shared_family_folder | boolean flag identifying the one built-in whole-family folder |

## AI Responsibilities

- The AI's access to any folder's contents is governed by the same View/Edit/Delete model as a human user — the AI can only see, use, or act on content it has View access to (or Edit/Delete, if performing an action that requires it), scoped to whichever user's request triggered the AI action (per `AI_Architecture.md`, `Security_Architecture.md`).
- The AI does not have any standing folder access beyond what the requesting user's own permissions allow.

## Permissions

- **Who can grant/change folder permissions:** anyone holding the **"Manage Folder Permissions"** permission (defined in `Authorization.md`), not just the folder's owner. This means an admin can adjust folder access without needing to be the original creator of that folder.
- **Inheritance override is Super Admin-only** — holding "Manage Folder Permissions" lets someone set permissions on a folder they manage, but does not grant the ability to break a subfolder's inheritance from its parent; only the Super Admin can do that.
- Per `Security_Architecture.md`, folder View access is also what determines whether a user can approve sending a given piece of content outside the home — they must already have View (at minimum) on the folder containing it.

## Dependencies

- Builds on `Data_Model.md` (Folder entity), `Authorization.md` ("Manage Folder Permissions," `delete_content`), and `Security_Architecture.md` (approval scoping).
- Feeds into `Documents.md` and `Family_Knowledge.md` module docs, and `06_Admin/Folder_Management.md`.

## Future Enhancements

- Auto-generated default folder structure per user role, for a commercial version.
- Possible additional shared folders beyond the single whole-family folder (e.g., a shared folder scoped to just the parents), if the need arises.

## Questions

None currently open.
