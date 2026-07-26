// Single-photo API. See docs/02_Modules/Photos.md: the uploader can toggle
// visibility any time ("the uploader can mark a specific photo private if
// they don't want it shown"); sensitivity override is Super Admin only;
// delete requires the delete_content permission.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, hasPermission } from "@/lib/core/permissions";
import { deleteUploadedFile } from "@/lib/storage/files";
import { removeFromIndex } from "@/lib/core/search";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface PhotoRow {
  id: string;
  file: string;
  uploaded_by: string;
  visibility: "public" | "private";
  is_sensitive: number;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM photos WHERE id = ?`).get(id) as PhotoRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such photo.", 404);

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};

  if (body?.visibility === "public" || body?.visibility === "private") {
    if (!canManageUser(actor, row.uploaded_by)) {
      return errorResponse("FORBIDDEN", "Only the uploader or an admin can change visibility.", 403);
    }
    updates.visibility = body.visibility;
  }

  if (typeof body?.isSensitive === "boolean") {
    if (actor.role !== "super_admin") {
      return errorResponse("FORBIDDEN", "Only the Super Admin can override sensitivity.", 403);
    }
    updates.is_sensitive = body.isSensitive ? 1 : 0;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("INVALID_INPUT", "No changes provided.", 400);
  }

  const setClause = Object.keys(updates).map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE photos SET ${setClause} WHERE id = @id`).run({ ...updates, id });

  return NextResponse.json({ id, ...updates });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM photos WHERE id = ?`).get(id) as PhotoRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such photo.", 404);

  if (!hasPermission(actor, "deleteContent")) {
    return errorResponse("FORBIDDEN", "You don't have permission to delete content.", 403);
  }

  db.prepare(`DELETE FROM photos WHERE id = ?`).run(id);
  await deleteUploadedFile(row.file);
  removeFromIndex("photo", id);

  return new NextResponse(null, { status: 204 });
}
