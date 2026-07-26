// Single-document API. See docs/02_Modules/Documents.md: sensitivity
// override is Super Admin only; delete requires folder Delete access.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canAccessFolder } from "@/lib/core/permissions";
import { deleteUploadedFile } from "@/lib/storage/files";

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

  // Per Documents.md: "The Super Admin can override this flag later" — no
  // one else may change sensitivity after upload.
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can override sensitivity.", 403);
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.isSensitive !== "boolean") {
    return errorResponse("INVALID_INPUT", "isSensitive (boolean) is required.", 400);
  }

  const db = getDb();
  const row = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as DocumentRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such document.", 404);

  db.prepare(`UPDATE documents SET is_sensitive = ? WHERE id = ?`).run(body.isSensitive ? 1 : 0, id);

  return NextResponse.json({ id, isSensitive: body.isSensitive });
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

  return new NextResponse(null, { status: 204 });
}
