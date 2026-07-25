// Shared permission-check service — the single place permission checks happen.
// Every module route calls through this rather than writing its own permission
// logic. See docs/01_System_Architecture/Application_Architecture.md ("Backend
// Structure: Modules + Shared Core Services") and docs/04_Permissions/*.

// TODO: implement against the real User/Folder schema once db/schema.sql is
// wired to an ORM or query layer. Signatures below are a starting contract,
// not final.

export type Role = "super_admin" | "admin" | "basic_user";

export interface PermissionContext {
  userId: string;
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

/**
 * Role/scope check — e.g., is this user an Admin scoped to the target user?
 * See docs/04_Permissions/Authorization.md.
 */
export async function hasRoleOrScope(
  ctx: PermissionContext,
  targetUserId: string,
  requiredRole: Role
): Promise<boolean> {
  throw new Error("Not implemented — see docs/04_Permissions/Authorization.md");
}
