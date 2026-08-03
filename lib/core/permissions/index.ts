// Shared permission-check service — the single place permission checks happen.
// Every module route calls through this rather than writing its own permission
// logic. See docs/01_System_Architecture/Application_Architecture.md ("Backend
// Structure: Modules + Shared Core Services") and docs/04_Permissions/*.

import { getDb } from "@/db/client";

export type { Role } from "./types";
export { FAMILY_ROLES } from "./types";
import type { Role } from "./types";

export interface PermissionContext {
  userId: string;
}

// Off-by-default, individually toggled per-user by an admin — distinct from
// role and admin scope. See Authorization.md's "Individually Grantable
// Permissions" table.
export interface GrantablePermissions {
  approveOutsideCalls: boolean;
  manageDevices: boolean;
  manageParentalControls: boolean;
  viewChildActivityLogs: boolean;
  deleteContent: boolean;
  manageFolderPermissions: boolean;
  approveSensitiveOutsideTransmission: boolean;
  // Only meaningful for role='external_viewer' — gates read access to the
  // Family Board. See db/schema.sql's users.view_family_board comment.
  viewFamilyBoard: boolean;
}

export interface AuthUser {
  id: string;
  role: Role;
  // Child user ids this Admin is scoped to (Authorization.md's "Admin Scope
  // (Parent → Child)") — always empty for Super Admin/Basic User.
  adminScope: string[];
  permissions: GrantablePermissions;
}

interface UserRow {
  id: string;
  role: Role;
  admin_scope: string | null;
  approve_outside_calls: number;
  manage_devices: number;
  manage_parental_controls: number;
  view_child_activity_logs: number;
  delete_content: number;
  manage_folder_permissions: number;
  approve_sensitive_outside_transmission: number;
  view_family_board: number;
}

/**
 * Loads a user's role/scope/permissions fresh from the database — per
 * Authorization.md, permission state is never cached or trusted from the
 * session cookie itself (the cookie only carries a signed user id).
 */
export async function getAuthUser(userId: string): Promise<AuthUser | null> {
  const row = getDb()
    .prepare(
      `SELECT id, role, admin_scope, approve_outside_calls, manage_devices,
              manage_parental_controls, view_child_activity_logs, delete_content,
              manage_folder_permissions, approve_sensitive_outside_transmission,
              view_family_board
       FROM users WHERE id = ?`
    )
    .get(userId) as UserRow | undefined;

  if (!row) return null;

  return {
    id: row.id,
    role: row.role,
    adminScope: row.admin_scope ? JSON.parse(row.admin_scope) : [],
    permissions: {
      approveOutsideCalls: !!row.approve_outside_calls,
      manageDevices: !!row.manage_devices,
      manageParentalControls: !!row.manage_parental_controls,
      viewChildActivityLogs: !!row.view_child_activity_logs,
      deleteContent: !!row.delete_content,
      manageFolderPermissions: !!row.manage_folder_permissions,
      approveSensitiveOutsideTransmission: !!row.approve_sensitive_outside_transmission,
      viewFamilyBoard: !!row.view_family_board,
    },
  };
}

/**
 * Does `actor` have admin authority over `targetUserId` specifically —
 * Super Admin (unconditional) or an Admin scoped to that child? Deliberately
 * excludes the trivial "acting on your own account" case — use this (not
 * canManageUser) wherever plain ownership must NOT itself grant the right,
 * e.g. Tasks.md: "the owner alone... cannot edit it, only complete it."
 */
export function hasAdminAuthorityOver(actor: AuthUser, targetUserId: string): boolean {
  if (actor.role === "super_admin") return true;
  return actor.role === "admin" && actor.adminScope.includes(targetUserId);
}

/**
 * Can `actor` manage `targetUserId`'s account? True for Super Admin
 * (unconditional), for a user managing their own account, or for an Admin
 * scoped to that child. See Authorization.md's Roles + Admin Scope sections.
 */
export function canManageUser(actor: AuthUser, targetUserId: string): boolean {
  if (actor.id === targetUserId) return true;
  return hasAdminAuthorityOver(actor, targetUserId);
}

/**
 * Does `actor` hold this individually grantable permission? Super Admin has
 * unconditional access to everything, so this is always true for them — see
 * Authorization.md's "Individually Grantable Permissions" section.
 */
export function hasPermission(actor: AuthUser, permission: keyof GrantablePermissions): boolean {
  if (actor.role === "super_admin") return true;
  return actor.permissions[permission];
}

export type FolderAccessLevel = "view" | "edit" | "delete";

// Grants store the single highest level held per user/role, not three
// independent booleans — Folder_Permissions.md defines Edit as implying View
// and Delete as implying View+Edit, so a lower level is never held without
// the ones below it.
export interface FolderPermissionGrants {
  users?: Partial<Record<string, FolderAccessLevel>>;
  roles?: Partial<Record<Role, FolderAccessLevel>>;
}

const FOLDER_ACCESS_RANK: Record<FolderAccessLevel, number> = { view: 1, edit: 2, delete: 3 };

interface FolderRow {
  id: string;
  parent_folder_id: string | null;
  inherits_permissions: number;
  permissions: string | null;
}

/**
 * Resolves a folder's *effective* permissions: its own, if it doesn't
 * inherit (top-level, or a Super-Admin-set override) — otherwise its
 * parent's, walked recursively. See Folder_Permissions.md's Nesting &
 * Inheritance section.
 */
export function resolveFolderPermissions(folderId: string): FolderPermissionGrants | null {
  const folder = getDb()
    .prepare(`SELECT id, parent_folder_id, inherits_permissions, permissions FROM folders WHERE id = ?`)
    .get(folderId) as FolderRow | undefined;

  if (!folder) return null;

  if (folder.inherits_permissions && folder.parent_folder_id) {
    return resolveFolderPermissions(folder.parent_folder_id);
  }

  return folder.permissions ? JSON.parse(folder.permissions) : null;
}

/**
 * Folder-level View/Edit/Delete check with nesting/inheritance.
 * See docs/04_Permissions/Folder_Permissions.md. Super Admin bypasses this
 * unconditionally, consistent with Authorization.md's "full, unconditional
 * access to everything."
 */
export async function canAccessFolder(
  ctx: PermissionContext,
  folderId: string,
  level: FolderAccessLevel
): Promise<boolean> {
  const actor = await getAuthUser(ctx.userId);
  if (!actor) return false;
  if (actor.role === "super_admin") return true;

  const grants = resolveFolderPermissions(folderId);
  if (!grants) return false;

  const grantedLevel = grants.users?.[actor.id] ?? grants.roles?.[actor.role];
  if (!grantedLevel) return false;

  return FOLDER_ACCESS_RANK[grantedLevel] >= FOLDER_ACCESS_RANK[level];
}

/**
 * Checks whether a user can approve sending a specific piece of content
 * outside the home. Per Security_Architecture.md: approval never grants new
 * access — the approver must already have View access to the content itself.
 */
export async function canApproveOutsideCall(
  ctx: PermissionContext,
  contentId: string,
  isSensitive: boolean
): Promise<boolean> {
  throw new Error("Not implemented — see docs/01_System_Architecture/Security_Architecture.md and docs/04_Permissions/AI_Permissions.md");
}
