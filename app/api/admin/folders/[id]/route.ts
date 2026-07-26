// Single-folder permission editing. See docs/06_Admin/Folder_Management.md
// and docs/04_Permissions/Folder_Permissions.md.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, hasPermission, resolveFolderPermissions } from "@/lib/core/permissions";
import { logSecurityEvent } from "@/lib/core/logging";
import { parsePermissionsPatch, parseInheritsPermissionsPatch } from "../fields";

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  if (!hasPermission(actor, "manageFolderPermissions")) {
    return errorResponse("FORBIDDEN", "Requires the Manage Folder Permissions permission.", 403);
  }

  const db = getDb();
  const row = db
    .prepare(`SELECT id, name, parent_folder_id, inherits_permissions, permissions, is_shared_family_folder FROM folders WHERE id = ?`)
    .get(id) as FolderRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such folder.", 404);

  const body = await req.json().catch(() => null);
  const inheritsPatch = parseInheritsPermissionsPatch(body);
  const permissionsPatch = parsePermissionsPatch(body);

  // Override control is Super Admin-only and functionally separate from
  // routine permission-granting — Folder_Permissions.md's explicit rule.
  if (inheritsPatch !== undefined) {
    if (actor.role !== "super_admin") {
      return errorResponse("FORBIDDEN", "Only the Super Admin can override folder inheritance.", 403);
    }
    if (inheritsPatch && !row.parent_folder_id) {
      return errorResponse("INVALID_INPUT", "A top-level folder has no parent to inherit from.", 400);
    }
    db.prepare(`UPDATE folders SET inherits_permissions = ? WHERE id = ?`).run(inheritsPatch ? 1 : 0, id);
  }

  if (permissionsPatch !== undefined) {
    // Re-read in case the inheritance flag above just changed.
    const current = db.prepare(`SELECT inherits_permissions FROM folders WHERE id = ?`).get(id) as {
      inherits_permissions: number;
    };
    if (current.inherits_permissions && row.parent_folder_id) {
      return errorResponse(
        "INVALID_STATE",
        "This folder inherits its permissions from its parent — ask the Super Admin to override inheritance before setting its own grants.",
        409
      );
    }
    db.prepare(`UPDATE folders SET permissions = ? WHERE id = ?`).run(
      permissionsPatch ? JSON.stringify(permissionsPatch) : null,
      id
    );
  }

  if (inheritsPatch !== undefined || permissionsPatch !== undefined) {
    await logSecurityEvent({
      type: "permission_changed",
      userId: actor.id,
      detail: { scope: "folder", folderId: id, folderName: row.name, inheritsPatch, permissionsPatch },
    });
  }

  const updated = db
    .prepare(`SELECT id, name, parent_folder_id, inherits_permissions, permissions, is_shared_family_folder FROM folders WHERE id = ?`)
    .get(id) as FolderRow;

  return NextResponse.json(toResponseShape(updated));
}
