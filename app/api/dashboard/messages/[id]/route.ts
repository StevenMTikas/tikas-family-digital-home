// Single Family Message API — edit and delete. See db/schema.sql's
// family_messages comment: edit is the poster only (nobody else, not even
// the Super Admin); delete is the poster or the Super Admin as a moderation
// backstop.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface MessageRow {
  id: string;
  posted_by: string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT id, posted_by FROM family_messages WHERE id = ?`).get(id) as MessageRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such message.", 404);

  if (actor.id !== row.posted_by) {
    return errorResponse("FORBIDDEN", "Only the person who posted this message can edit it.", 403);
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return errorResponse("INVALID_INPUT", "Message text is required.", 400);

  db.prepare(`UPDATE family_messages SET text = ?, updated_at = datetime('now') WHERE id = ?`).run(text, id);

  const updated = db
    .prepare(
      `SELECT m.id, m.text, m.posted_by, u.full_name AS posted_by_name, m.created_at, m.updated_at
       FROM family_messages m JOIN users u ON u.id = m.posted_by WHERE m.id = ?`
    )
    .get(id) as { id: string; text: string; posted_by: string; posted_by_name: string; created_at: string; updated_at: string };

  return NextResponse.json({
    id: updated.id,
    text: updated.text,
    postedBy: updated.posted_by,
    postedByName: updated.posted_by_name,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT id, posted_by FROM family_messages WHERE id = ?`).get(id) as MessageRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such message.", 404);

  const isOwner = actor.id === row.posted_by;
  if (!isOwner && actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the person who posted this message, or the Super Admin, can delete it.", 403);
  }

  db.prepare(`DELETE FROM family_messages WHERE id = ?`).run(id);
  return new NextResponse(null, { status: 204 });
}
