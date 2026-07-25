# Authorization

## Purpose

Defines what a logged-in user is actually allowed to do — the role model, scoped admin relationships, and individually grantable permissions. Where `Authentication.md` establishes *who* is logged in, this document establishes *what they can do*. `Folder_Permissions.md` and `AI_Permissions.md` build on this for their specific domains.

## Goals

- Design the role/scope model to naturally support multiple children per family, even though the initial household only has one (Malachi) — avoid a rewrite later for a pattern that's cheap to generalize now.
- Keep permission checks always evaluated fresh, never cached, given how central security is to this system.
- Make the distinction clear between what comes from a **role**, what comes from **admin scope**, and what's an **individually grantable permission** — three different mechanisms, not one blended concept.

## User Stories

- As the Super Admin, I want full control over the entire system, unconditionally.
- As a parent Admin, I want full control over any of my children's accounts specifically, without needing Super Admin's involvement for routine parenting decisions.
- As a Basic User, I want to manage my own content and use the AI, without being able to affect anyone else's data or the system's settings.
- As an admin, I want to grant or revoke specific permissions (like Approve Outside Calls) to individual family members, independent of their base role.

## Features

### Roles

| Role | Scope |
|---|---|
| **Super Admin** | Full, unconditional access to everything — every user, every setting, every technical admin tool. Exactly one per household (Dad, in this case). |
| **Admin (scoped)** | Full control over their own account, plus full admin control over any user(s) they are scoped to — designed generally as **"any child on the same family account,"** not hardcoded to a specific child. Vee is scoped to Malachi today; the same mechanism would cover additional children if the family has more later. |
| **Basic User** | Standard access to their own content and to whatever else their permissions/folder access allow. Default role for any newly added family member. |

### Admin Scope (Parent → Child)

- An Admin's scope is defined as a **set of child user(s)** they have authority over, not a single hardcoded relationship.
- A Super Admin assigns scope when a child's account is created (or later), by linking that child to the parent Admin(s) responsible for them.
- More than one Admin can be scoped to the same child (e.g., both parents scoped to the same kid).
- Scope grants the Admin full control over that child's account — equivalent to what Super Admin can do, but limited strictly to that child's account and data, never extending to another user's data or system-wide settings.

### Individually Grantable Permissions

These are separate from role and scope — off by default, and explicitly toggled per-user by an admin (their own admin, or Super Admin):

| Permission | Notes |
|---|---|
| **Approve Outside Calls** | Off by default for everyone; off by default for a child's account as a standing rule (per `Security_Architecture.md`). |
| **Manage Devices** | Add or revoke trusted devices. |
| **Manage Parental Controls** | Only meaningful for an Admin, scoped to the child/children they cover. |
| **View Child Activity Logs** | Only meaningful for an Admin, scoped to the child/children they cover. |
| **Delete Documents/Family Knowledge Items** | Distinct from create/edit — deleting is a heavier action, per the "every destructive action is reversible" rule, but the *permission to trigger* a delete is still worth gating separately. |
| **Manage Folder Permissions** | Who can access a given folder — distinct from being able to add content to it. |

### Inherently Super Admin-Only (Not Individually Grantable)

- Resetting any user's password.
- Assigning or changing admin scope (who is scoped to which child).
- Access to technical admin tools — backups, system logs, monitoring (per `Security_Architecture.md`, these are MVP-only and would not exist in a commercial version).

## Screen Layout

- Role, scope, and individually grantable permissions are all managed from the **Administration** module, under a given user's account settings.
- Scoped Admins see and manage only the settings relevant to their own account and their scoped child/children — they do not see a full system-wide admin view.
- Super Admin sees and can manage everything.

## Data Stored

Extends the **User** entity from `Data_Model.md`:

| Field | Notes |
|---|---|
| role | Super Admin / Admin / Basic User |
| admin_scope | for an Admin, a list of child user_ids they're scoped to (replaces the earlier single-relationship assumption) |
| approve_outside_calls | existing field |
| manage_devices | new individually grantable permission |
| manage_parental_controls | new individually grantable permission |
| view_child_activity_logs | new individually grantable permission |
| delete_content | new individually grantable permission |
| manage_folder_permissions | new individually grantable permission |

*(This supersedes the flat `admin_scope` description in `Data_Model.md`'s original User entity — should be updated there to reflect a list rather than a single value.)*

## AI Responsibilities

- None directly — Authorization is a rules layer the AI's permission checks (`/lib/core/permissions`, per `Application_Architecture.md` and `AI_Architecture.md`) consult before acting, not something the AI manages itself.

## Permissions

- Every request — human or AI-initiated — is checked **fresh, every time**, via the shared `/lib/core/permissions` service. No cached or session-level permission state.
- Role, scope, and individually grantable permissions are evaluated together: role determines baseline access, scope extends it to specific other users' data (Admin → child), and individually grantable permissions add specific capabilities on top of either.

## Dependencies

- Builds on `Security_Architecture.md` (permission philosophy, Approve Outside Calls) and `Data_Model.md` (User entity).
- Feeds into `Folder_Permissions.md`, `AI_Permissions.md`, and the Administration module (`06_Admin`).
- Requires a follow-up update to `Data_Model.md`'s User entity to reflect `admin_scope` as a list and the newly defined individually grantable permission fields.

## Future Enhancements

- Finer-grained permission grants beyond the current list, if real usage reveals a need (e.g., "can edit Calendar but not Documents").
- Possible permission templates/presets (e.g., a one-click "standard teenager" permission set) once more families are using the system.

## Questions

None currently open.
