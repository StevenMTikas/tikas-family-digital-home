// Single-document API. See docs/02_Modules/Documents.md: category can be
// changed by anyone who can see the document; sensitivity by the Super Admin
// (any document) or the uploader (their own document); delete requires
// folder Delete access.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canAccessFolder } from "@/lib/core/permissions";
import { deleteUploadedFile } from "@/lib/storage/files";
import { removeFromIndex } from "@/lib/core/search";
import { ensureCategoryExists } from "@/lib/core/documents/categories";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface DocumentRow {
  id: string;
  file: string;
  title: string;
  folder_id: string | null;
  category: string | null;
  is_sensitive: number;
  uploaded_by: string;
  uploaded_at: string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as DocumentRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such document.", 404);

  const body = await req.json().catch(() => null);
  const changingSensitivity = typeof body?.isSensitive === "boolean";
  const changingCategory = typeof body?.category === "string" || body?.category === null;

  if (!changingSensitivity && !changingCategory) {
    return errorResponse("INVALID_INPUT", "isSensitive (boolean) or category (string|null) is required.", 400);
  }

  if (changingSensitivity) {
    // Per Documents.md: the Super Admin can override sensitivity on any
    // document, any time. The uploader can also set it on their own
    // document — the Content page only exposes that control on the Edit
    // Document modal, not the list's Super-Admin-only toggle, but the rule
    // enforced here is simply "Super Admin, or you uploaded it."
    const isOwner = actor.id === row.uploaded_by;
    if (actor.role !== "super_admin" && !isOwner) {
      return errorResponse("FORBIDDEN", "Only the Super Admin, or the person who uploaded this document, can change its sensitivity.", 403);
    }
    db.prepare(`UPDATE documents SET is_sensitive = ? WHERE id = ?`).run(body.isSensitive ? 1 : 0, id);
  }

  let category: string | null = row.category;
  if (changingCategory) {
    // Categorizing is organizational, not access-changing, and only ever
    // reached via the Edit Document modal — which only ever shows a document
    // someone already has View access to (Content page filters by that
    // before it's ever rendered). Unlike sensitivity, no ownership or folder
    // Edit-access check here: any family member who can see a document can
    // categorize it (Steven, 2026-07-31 — folder Edit access was blocking
    // people from categorizing their own uploads in shared folders).
    category = typeof body.category === "string" ? body.category.trim() || null : null;
    db.prepare(`UPDATE documents SET category = ? WHERE id = ?`).run(category, id);
    if (category) ensureCategoryExists(category, actorId!);
  }

  return NextResponse.json({
    id,
    isSensitive: changingSensitivity ? body.isSensitive : !!row.is_sensitive,
    category,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as DocumentRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such document.", 404);

  if (!row.folder_id || !(await canAccessFolder({ userId: actorId! }, row.folder_id, "delete"))) {
    return errorResponse("FORBIDDEN", "You don't have Delete access to this document's folder.", 403);
  }

  db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
  await deleteUploadedFile(row.file);
  removeFromIndex("document", id);

  return new NextResponse(null, { status: 204 });
}
