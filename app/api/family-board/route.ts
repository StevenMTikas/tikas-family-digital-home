// Family Board API. Deliberately modeled on
// app/api/dashboard/messages/route.ts (the Family Message Board) — same
// minimal shape and rules, plus the external_viewer read grant. See
// app/api/family-board/access.ts and db/schema.sql's family_board_posts
// comment.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { canReadBoard, canPostToBoard } from "./access";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface PostRow {
  id: string;
  text: string;
  posted_by: string;
  posted_by_name: string;
  created_at: string;
  updated_at: string;
}

function toResponse(row: PostRow) {
  return {
    id: row.id,
    text: row.text,
    postedBy: row.posted_by,
    postedByName: row.posted_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  if (!canReadBoard(actor)) {
    return errorResponse("FORBIDDEN", "You don't have access to the Family Board.", 403);
  }

  const rows = getDb()
    .prepare(
      `SELECT p.id, p.text, p.posted_by, u.full_name AS posted_by_name, p.created_at, p.updated_at
       FROM family_board_posts p JOIN users u ON u.id = p.posted_by
       ORDER BY p.created_at DESC`
    )
    .all() as PostRow[];

  return NextResponse.json(rows.map(toResponse));
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  if (!canPostToBoard(actor)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin can post to the Family Board.", 403);
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return errorResponse("INVALID_INPUT", "Post text is required.", 400);

  const db = getDb();
  const id = randomUUID();
  db.prepare(`INSERT INTO family_board_posts (id, text, posted_by) VALUES (?, ?, ?)`).run(id, text, actor.id);

  const row = db
    .prepare(
      `SELECT p.id, p.text, p.posted_by, u.full_name AS posted_by_name, p.created_at, p.updated_at
       FROM family_board_posts p JOIN users u ON u.id = p.posted_by WHERE p.id = ?`
    )
    .get(id) as PostRow;

  return NextResponse.json(toResponse(row), { status: 201 });
}
