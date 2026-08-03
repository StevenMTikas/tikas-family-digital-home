// Split out from index.ts (2026-08) so client bundles (frontend role-union
// literals in lib/api/*.ts) can import the real Role type without pulling in
// index.ts's better-sqlite3/getDb import chain, which only runs server-side.

export type Role = "super_admin" | "admin" | "basic_user" | "external_viewer";

// The three internal/household roles, as distinct from external_viewer —
// used to filter the general family roster (GET /api/users and the other
// "every row is a family member" queries) so external_viewer accounts don't
// appear there. See app/api/users/route.ts.
export const FAMILY_ROLES: Role[] = ["super_admin", "admin", "basic_user"];
