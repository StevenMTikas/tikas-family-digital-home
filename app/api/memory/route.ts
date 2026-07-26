// Memory API. See docs/02_Modules/Memory.md: text-only, photo-only,
// document-only, or any combination — no required attachment. Attaching a
// Photo/Document requires the attacher already have View access to it
// (attaching doesn't grant new access, it links content already visible).

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
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
    // Delete requires the delete_content permission specifically
    // (Memory.md) — a different, narrower gate than canEdit above.
    canDelete: hasPermission(actor, "deleteContent"),
    ...getAttachments(row.id),
  };
}

/** Verifies the actor already has View access to every photo/document being attached. */
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

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const rows = getDb().prepare(`SELECT * FROM memories ORDER BY created_at DESC`).all() as MemoryRow[];

  const visible = rows.filter(
    (row) => row.visibility === "public" || canManageUser(actor, row.created_by)
  );

  return NextResponse.json(visible.map((row) => toMemoryResponse(row, actor)));
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const captionNotes = typeof body?.captionNotes === "string" ? body.captionNotes.trim() || null : null;
  const eventLink = typeof body?.eventLink === "string" && body.eventLink ? body.eventLink : null;
  const visibility = body?.visibility === "private" ? "private" : "public";
  const isSensitive = body?.isSensitive === true;
  const photoIds: string[] = Array.isArray(body?.photoIds) ? body.photoIds.filter((v: unknown) => typeof v === "string") : [];
  const documentIds: string[] = Array.isArray(body?.documentIds)
    ? body.documentIds.filter((v: unknown) => typeof v === "string")
    : [];

  if (!title) {
    return errorResponse("INVALID_INPUT", "A title is required.", 400);
  }

  const accessError = await verifyAttachmentAccess(actor, photoIds, documentIds);
  if (accessError) return errorResponse("FORBIDDEN", accessError, 403);

  const db = getDb();
  const id = randomUUID();

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO memories (id, title, caption_notes, event_link, visibility, is_sensitive, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title, captionNotes, eventLink, visibility, isSensitive ? 1 : 0, actorId);

    const insertPhoto = db.prepare(`INSERT INTO memory_photos (memory_id, photo_id) VALUES (?, ?)`);
    for (const photoId of photoIds) insertPhoto.run(id, photoId);

    const insertDoc = db.prepare(`INSERT INTO memory_documents (memory_id, document_id) VALUES (?, ?)`);
    for (const documentId of documentIds) insertDoc.run(id, documentId);
  });
  insert();

  const row = db.prepare(`SELECT * FROM memories WHERE id = ?`).get(id) as MemoryRow;
  return NextResponse.json(toMemoryResponse(row, actor), { status: 201 });
}
