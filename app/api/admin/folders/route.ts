// Folder Management API. See docs/06_Admin/Folder_Management.md — the
// management interface for the existing Folder entity's `permissions`,
// `inherits_permissions`, and `is_shared_family_folder` fields. No folder
// creation here: Folder_Management.md's Features list doesn't include
// creating folders, only managing the ones that already exist (currently
// just the single seeded "Whole Family" folder — see Folder_Permissions.md).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, hasPermission, resolveFolderPermissions } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface FolderRow {
  id: string;
  name: string;
  parent_folder_id: string | null;
  inherits_permissions: number;
  permissions: string | null;
  is_shared_family_folder: number;
}

function toResponseShape(row: FolderRow) {
  const inherits = !!row.inherits_permissions && !!row.parent_folder_id;
  return {
    id: row.id,
    name: row.name,
    parentFolderId: row.parent_folder_id,
    isSharedFamilyFolder: !!row.is_shared_family_folder,
    inheritsPermissions: inherits,
    ownPermissions: row.permissions ? JSON.parse(row.permissions) : null,
    effectivePermissions: resolveFolderPermissions(row.id),
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  if (!hasPermission(actor, "manageFolderPermissions")) {
    return errorResponse("FORBIDDEN", "Requires the Manage Folder Permissions permission.", 403);
  }

  const rows = getDb()
    .prepare(`SELECT id, name, parent_folder_id, inherits_permissions, permissions, is_shared_family_folder FROM folders`)
    .all() as FolderRow[];

  return NextResponse.json(rows.map(toResponseShape));
}
