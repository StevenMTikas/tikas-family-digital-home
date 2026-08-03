// Pulled out of route.ts because Next.js's route type-checking rejects any
// export from a route.ts file other than the HTTP verb handlers — same
// reasoning as app/api/admin/folders/fields.ts.
//
// Deliberately mirrors family_messages' rules exactly (see
// db/schema.sql's family_board_posts comment): any internal role reads
// unconditionally; posting is Admin/Super Admin only; editing is poster-only
// (nobody else); deleting is poster-or-Super-Admin. The one addition is
// external_viewer read access, gated by the view_family_board grant — an
// external_viewer can never post/edit/delete, since they never satisfy any
// of those three checks (not an admin, never the poster).

import { hasPermission, type AuthUser } from "@/lib/core/permissions";

export function canReadBoard(actor: AuthUser): boolean {
  if (actor.role === "external_viewer") return hasPermission(actor, "viewFamilyBoard");
  return true;
}

export function canPostToBoard(actor: AuthUser): boolean {
  return actor.role === "admin" || actor.role === "super_admin";
}

export function canEditBoardPost(actor: AuthUser, postedBy: string): boolean {
  return actor.id === postedBy;
}

export function canDeleteBoardPost(actor: AuthUser, postedBy: string): boolean {
  return actor.id === postedBy || actor.role === "super_admin";
}
