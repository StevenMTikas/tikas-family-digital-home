// Photo visibility predicate — pulled out of route.ts (Next.js route files
// may only export HTTP verb handlers) so it's independently testable, same
// reasoning as app/api/admin/folders/fields.ts.
//
// Internal-role visibility (Photos.md: "no folder requirement... visibility
// is governed directly by the public/private setting on the photo itself")
// is completely unchanged. The new external_viewer branch (2026-08) is
// additive — it layers the existing Folder Permissions system
// (canAccessFolder) on top via photos.folder_id, granted through the
// already-built Folder Permissions admin UI, no new grant UI needed. See
// db/schema.sql's photos.folder_id comment.

import { canManageUser, canAccessFolder, type AuthUser } from "@/lib/core/permissions";

export interface PhotoVisibilityRow {
  visibility: "public" | "private";
  is_sensitive: number;
  uploaded_by: string;
  folder_id: string | null;
}

export async function isPhotoVisibleTo(actor: AuthUser, row: PhotoVisibilityRow): Promise<boolean> {
  if (actor.role === "external_viewer") {
    // Sensitive photos are always excluded for this role, even if the
    // containing folder is granted — a conservative default for anything
    // leaving the home network over the open internet (Funnel).
    if (row.visibility !== "public" || row.is_sensitive || !row.folder_id) return false;
    return canAccessFolder({ userId: actor.id }, row.folder_id, "view");
  }
  return row.visibility === "public" || canManageUser(actor, row.uploaded_by);
}
