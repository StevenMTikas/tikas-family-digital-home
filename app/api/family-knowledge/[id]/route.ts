// Single Family Knowledge item API. Edit governed by folder permissions (not
// creator-based, per Family_Knowledge.md); Delete requires the delete_content
// permission (per Authorization.md, same as Documents/Photos/Memory) rather
// than folder-scoped access; sensitivity override stays Super-Admin-only.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canAccessFolder, hasPermission } from "@/lib/core/permissions";
import { indexContent, removeFromIndex } from "@/lib/core/search";
import { logSecurityEvent } from "@/lib/core/logging";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface ItemRow {
  id: string;
  category: string | null;
  title: string;
  content: string | null;
  is_sensitive: number;
  folder_id: string | null;
  created_by: string;
  updated_at: string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM family_knowledge_items WHERE id = ?`).get(id) as ItemRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such item.", 404);

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};

  const editingDetails =
    typeof body?.title === "string" || typeof body?.category === "string" || body?.category === null ||
    typeof body?.content === "string" || body?.content === null;

  if (editingDetails) {
    if (!row.folder_id || !(await canAccessFolder({ userId: actor.id }, row.folder_id, "edit"))) {
      return errorResponse("FORBIDDEN", "You don't have Edit access to this item's folder.", 403);
    }
    if (typeof body?.title === "string" && body.title.trim()) updates.title = body.title.trim();
    if (typeof body?.category === "string" || body?.category === null) updates.category = body.category;
    if (typeof body?.content === "string" || body?.content === null) updates.content = body.content;
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

  updates.updated_at = new Date().toISOString();
  const setClause = Object.keys(updates).map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE family_knowledge_items SET ${setClause} WHERE id = @id`).run({ ...updates, id });

  const updated = db.prepare(`SELECT * FROM family_knowledge_items WHERE id = ?`).get(id) as ItemRow;
  if (editingDetails) {
    indexContent("family_knowledge", id, `${updated.title} ${updated.category ?? ""} ${updated.content ?? ""}`).catch((err) =>
      console.error("[search] Failed to re-index family knowledge item:", err)
    );
  }
  return NextResponse.json({
    id: updated.id,
    category: updated.category,
    title: updated.title,
    content: updated.content,
    isSensitive: !!updated.is_sensitive,
    folderId: updated.folder_id,
    createdBy: updated.created_by,
    updatedAt: updated.updated_at,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT folder_id, title FROM family_knowledge_items WHERE id = ?`).get(id) as
    | { folder_id: string | null; title: string }
    | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such item.", 404);

  if (!hasPermission(actor, "deleteContent")) {
    return errorResponse("FORBIDDEN", "You don't have permission to delete content.", 403);
  }

  db.prepare(`DELETE FROM family_knowledge_items WHERE id = ?`).run(id);
  removeFromIndex("family_knowledge", id);
  await logSecurityEvent({
    type: "family_knowledge_item_deleted",
    userId: actor.id,
    detail: { itemId: id, title: row.title },
  });
  return new NextResponse(null, { status: 204 });
}
