// Shared permission-check service — the single place permission checks happen.
// Every module route calls through this rather than writing its own permission
// logic. See docs/01_System_Architecture/Application_Architecture.md ("Backend
// Structure: Modules + Shared Core Services") and docs/04_Permissions/*.

import { getDb } from "@/db/client";

export type Role = "super_admin" | "admin" | "basic_user";

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
              manage_folder_permissions, approve_sensitive_outside_transmission
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
    },
  };
}

/**
 * Can `actor` manage `targetUserId`'s account? True for Super Admin
 * (unconditional), for a user managing their own account, or for an Admin
 * scoped to that child. See Authorization.md's Roles + Admin Scope sections.
 */
export function canManageUser(actor: AuthUser, targetUserId: string): boolean {
  if (actor.role === "super_admin") return true;
  if (actor.id === targetUserId) return true;
  return actor.role === "admin" && actor.adminScope.includes(targetUserId);
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

/**
 * Folder-level View/Edit/Delete check with nesting/inheritance.
 * See docs/04_Permissions/Folder_Permissions.md.
 */
export async function canAccessFolder(
  ctx: PermissionContext,
  folderId: string,
  level: "view" | "edit" | "delete"
): Promise<boolean> {
  throw new Error("Not implemented — see docs/04_Permissions/Folder_Permissions.md");
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
