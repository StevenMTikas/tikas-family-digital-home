// Pulled out of route.ts because Next.js's route type-checking rejects any
// export from a route.ts file other than the HTTP verb handlers.

import type { FolderPermissionGrants, FolderAccessLevel, Role } from "@/lib/core/permissions";

const VALID_LEVELS: FolderAccessLevel[] = ["view", "edit", "delete"];
const VALID_ROLES: Role[] = ["super_admin", "admin", "basic_user"];

/** Validates an arbitrary request body's `permissions` field into a well-formed FolderPermissionGrants, or null if absent/malformed. */
export function parsePermissionsPatch(body: unknown): FolderPermissionGrants | null | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (!("permissions" in b)) return undefined;
  const permissions = b.permissions;
  if (permissions === null) return null;
  if (typeof permissions !== "object") return undefined;

  const grants: FolderPermissionGrants = {};
  const p = permissions as Record<string, unknown>;

  if (p.users && typeof p.users === "object") {
    const users: Record<string, FolderAccessLevel> = {};
    for (const [userId, level] of Object.entries(p.users as Record<string, unknown>)) {
      if (VALID_LEVELS.includes(level as FolderAccessLevel)) users[userId] = level as FolderAccessLevel;
    }
    grants.users = users;
  }
  if (p.roles && typeof p.roles === "object") {
    const roles: Partial<Record<Role, FolderAccessLevel>> = {};
    for (const [role, level] of Object.entries(p.roles as Record<string, unknown>)) {
      if (VALID_ROLES.includes(role as Role) && VALID_LEVELS.includes(level as FolderAccessLevel)) {
        roles[role as Role] = level as FolderAccessLevel;
      }
    }
    grants.roles = roles;
  }
  return grants;
}

export function parseInheritsPermissionsPatch(body: unknown): boolean | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const b = body as Record<string, unknown>;
  return typeof b.inheritsPermissions === "boolean" ? b.inheritsPermissions : undefined;
}
