// Family Message Board API. See docs/02_Modules/Dashboard.md: a plain
// human-to-family channel on the family-wide Dashboard view. Anyone can
// read; only an Admin or Super Admin can post.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface MessageRow {
  id: string;
  text: string;
  posted_by: string;
  posted_by_name: string;
  created_at: string;
  updated_at: string;
}

function toResponse(row: MessageRow) {
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

  const rows = getDb()
    .prepare(
      `SELECT m.id, m.text, m.posted_by, u.full_name AS posted_by_name, m.created_at, m.updated_at
       FROM family_messages m JOIN users u ON u.id = m.posted_by
       ORDER BY m.created_at DESC`
    )
    .all() as MessageRow[];

  return NextResponse.json(rows.map(toResponse));
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  // Per Dashboard.md: posting is Admin/Super Admin only — a Basic User can
  // read the board but not post to it. Written as an allow-list, not a
  // `=== "basic_user"` deny-list — a deny-list would silently let a 4th role
  // (external_viewer) through unintended.
  if (actor.role !== "admin" && actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin can post to the family message board.", 403);
  }

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return errorResponse("INVALID_INPUT", "Message text is required.", 400);

  const db = getDb();
  const id = randomUUID();
  db.prepare(`INSERT INTO family_messages (id, text, posted_by) VALUES (?, ?, ?)`).run(id, text, actor.id);

  const row = db
    .prepare(
      `SELECT m.id, m.text, m.posted_by, u.full_name AS posted_by_name, m.created_at, m.updated_at
       FROM family_messages m JOIN users u ON u.id = m.posted_by WHERE m.id = ?`
    )
    .get(id) as MessageRow;

  return NextResponse.json(toResponse(row), { status: 201 });
}
