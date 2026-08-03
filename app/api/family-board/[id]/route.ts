// Single Family Board post API — edit and delete. See
// app/api/family-board/access.ts and db/schema.sql's family_board_posts
// comment: edit is the poster only (nobody else, not even the Super Admin);
// delete is the poster or the Super Admin as a moderation backstop — same
// asymmetry as family_messages.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { canEditBoardPost, canDeleteBoardPost } from "../access";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface PostRow {
  id: string;
  posted_by: string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT id, posted_by FROM family_board_posts WHERE id = ?`).get(id) as PostRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such post.", 404);

  if (!canEditBoardPost(actor, row.posted_by)) {
    return errorResponse("FORBIDDEN", "Only the person who posted this can edit it.", 403);
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return errorResponse("INVALID_INPUT", "Post text is required.", 400);

  db.prepare(`UPDATE family_board_posts SET text = ?, updated_at = datetime('now') WHERE id = ?`).run(text, id);

  const updated = db
    .prepare(
      `SELECT p.id, p.text, p.posted_by, u.full_name AS posted_by_name, p.created_at, p.updated_at
       FROM family_board_posts p JOIN users u ON u.id = p.posted_by WHERE p.id = ?`
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
  const row = db.prepare(`SELECT id, posted_by FROM family_board_posts WHERE id = ?`).get(id) as PostRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such post.", 404);

  if (!canDeleteBoardPost(actor, row.posted_by)) {
    return errorResponse("FORBIDDEN", "Only the person who posted this, or the Super Admin, can delete it.", 403);
  }

  db.prepare(`DELETE FROM family_board_posts WHERE id = ?`).run(id);
  return new NextResponse(null, { status: 204 });
}
