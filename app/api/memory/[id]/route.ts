// Single-memory API. See docs/02_Modules/Memory.md: creator (or admin) can
// edit; sensitivity override is Super Admin only; delete requires the
// delete_content permission. Re-attaching photos/documents re-checks View
// access on each, same rule as creation.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, canAccessFolder, hasPermission, type AuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface MemoryRow {
  id: string;
  title: string;
  caption_notes: string | null;
  event_link: string | null;
  visibility: "public" | "private";
  is_sensitive: number;
  created_by: string;
  created_at: string;
}

interface PhotoRow {
  id: string;
  uploaded_by: string;
  visibility: "public" | "private";
}

interface DocRow {
  id: string;
  folder_id: string | null;
}

function getAttachments(memoryId: string) {
  const db = getDb();
  const photoIds = (
    db.prepare(`SELECT photo_id FROM memory_photos WHERE memory_id = ?`).all(memoryId) as {
      photo_id: string;
    }[]
  ).map((r) => r.photo_id);
  const documentIds = (
    db.prepare(`SELECT document_id FROM memory_documents WHERE memory_id = ?`).all(memoryId) as {
      document_id: string;
    }[]
  ).map((r) => r.document_id);
  return { photoIds, documentIds };
}

async function verifyAttachmentAccess(
  actor: AuthUser,
  photoIds: string[],
  documentIds: string[]
): Promise<string | null> {
  const db = getDb();
  for (const photoId of photoIds) {
    const photo = db.prepare(`SELECT id, uploaded_by, visibility FROM photos WHERE id = ?`).get(photoId) as
      | PhotoRow
      | undefined;
    if (!photo) return `No such photo: ${photoId}`;
    if (photo.visibility !== "public" && !canManageUser(actor, photo.uploaded_by)) {
      return "You don't have access to one of the attached photos.";
    }
  }
  for (const documentId of documentIds) {
    const doc = db.prepare(`SELECT id, folder_id FROM documents WHERE id = ?`).get(documentId) as
      | DocRow
      | undefined;
    if (!doc) return `No such document: ${documentId}`;
    if (!doc.folder_id || !(await canAccessFolder({ userId: actor.id }, doc.folder_id, "view"))) {
      return "You don't have access to one of the attached documents.";
    }
  }
  return null;
}

function toMemoryResponse(row: MemoryRow, actor: AuthUser) {
  return {
    id: row.id,
    title: row.title,
    captionNotes: row.caption_notes,
    eventLink: row.event_link,
    visibility: row.visibility,
    isSensitive: !!row.is_sensitive,
    createdBy: row.created_by,
    createdAt: row.created_at,
    canEdit: canManageUser(actor, row.created_by),
    ...getAttachments(row.id),
  };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as MemoryRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such memory.", 404);

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};
  const isEditor = canManageUser(actor, row.created_by);

  if (typeof body?.title === "string" && body.title.trim()) {
    if (!isEditor) return errorResponse("FORBIDDEN", "Only the creator or an admin can edit this memory.", 403);
    updates.title = body.title.trim();
  }
  if (typeof body?.captionNotes === "string" || body?.captionNotes === null) {
    if (!isEditor) return errorResponse("FORBIDDEN", "Only the creator or an admin can edit this memory.", 403);
    updates.caption_notes = body.captionNotes;
  }
  if (typeof body?.eventLink === "string" || body?.eventLink === null) {
    if (!isEditor) return errorResponse("FORBIDDEN", "Only the creator or an admin can edit this memory.", 403);
    updates.event_link = body.eventLink;
  }
  if (body?.visibility === "public" || body?.visibility === "private") {
    if (!isEditor) return errorResponse("FORBIDDEN", "Only the creator or an admin can edit this memory.", 403);
    updates.visibility = body.visibility;
  }
  if (typeof body?.isSensitive === "boolean") {
    if (actor.role !== "super_admin") {
      return errorResponse("FORBIDDEN", "Only the Super Admin can override sensitivity.", 403);
    }
    updates.is_sensitive = body.isSensitive ? 1 : 0;
  }

  let photoIds: string[] | undefined;
  let documentIds: string[] | undefined;
  if (Array.isArray(body?.photoIds) || Array.isArray(body?.documentIds)) {
    if (!isEditor) return errorResponse("FORBIDDEN", "Only the creator or an admin can edit this memory.", 403);
    const newPhotoIds: string[] = Array.isArray(body.photoIds)
      ? body.photoIds.filter((v: unknown) => typeof v === "string")
      : getAttachments(id).photoIds;
    const newDocumentIds: string[] = Array.isArray(body.documentIds)
      ? body.documentIds.filter((v: unknown) => typeof v === "string")
      : getAttachments(id).documentIds;
    const accessError = await verifyAttachmentAccess(actor, newPhotoIds, newDocumentIds);
    if (accessError) return errorResponse("FORBIDDEN", accessError, 403);
    photoIds = newPhotoIds;
    documentIds = newDocumentIds;
  }

  if (Object.keys(updates).length === 0 && !photoIds && !documentIds) {
    return errorResponse("INVALID_INPUT", "No changes provided.", 400);
  }

  const update = db.transaction(() => {
    if (Object.keys(updates).length > 0) {
      const setClause = Object.keys(updates).map((f) => `${f} = @${f}`).join(", ");
      db.prepare(`UPDATE memories SET ${setClause} WHERE id = @id`).run({ ...updates, id });
    }
    if (photoIds) {
      db.prepare(`DELETE FROM memory_photos WHERE memory_id = ?`).run(id);
      const insertPhoto = db.prepare(`INSERT INTO memory_photos (memory_id, photo_id) VALUES (?, ?)`);
      for (const photoId of photoIds) insertPhoto.run(id, photoId);
    }
    if (documentIds) {
      db.prepare(`DELETE FROM memory_documents WHERE memory_id = ?`).run(id);
      const insertDoc = db.prepare(`INSERT INTO memory_documents (memory_id, document_id) VALUES (?, ?)`);
      for (const documentId of documentIds) insertDoc.run(id, documentId);
    }
  });
  update();

  const updated = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as MemoryRow;
  return NextResponse.json(toMemoryResponse(updated, actor));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT id FROM memories WHERE id = ?`).get(id) as { id: string } | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such memory.", 404);

  if (!hasPermission(actor, "deleteContent")) {
    return errorResponse("FORBIDDEN", "You don't have permission to delete content.", 403);
  }

  db.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
  return new NextResponse(null, { status: 204 });
}
