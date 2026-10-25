// Curriculum Links — a Subject's course/material URL(s) for the current
// school year. See db/schema.sql's curriculum_links comment and
// docs/02_Modules/Homeschool.md. Admin/Super-Admin only, same boundary as
// the rest of curriculum planning (adding a link is a step toward
// generating homework for a child, same authority level as assigning it
// directly).

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface LinkRow {
  id: string;
  subject_id: string;
  url: string;
  label: string | null;
}

function toResponse(row: LinkRow) {
  return { id: row.id, subjectId: row.subject_id, url: row.url, label: row.label };
}

function isAdmin(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const subjectId = req.nextUrl.searchParams.get("subjectId");
  const db = getDb();
  const rows = subjectId
    ? (db.prepare(`SELECT * FROM curriculum_links WHERE subject_id = ? ORDER BY added_at`).all(subjectId) as LinkRow[])
    : (db.prepare(`SELECT * FROM curriculum_links ORDER BY added_at`).all() as LinkRow[]);

  return NextResponse.json(rows.map(toResponse));
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (!isAdmin(actor.role)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin can add a curriculum link.", 403);
  }

  const body = await req.json().catch(() => null);
  const subjectId = typeof body?.subjectId === "string" ? body.subjectId : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const label = typeof body?.label === "string" ? body.label.trim() || null : null;

  if (!subjectId || !url) {
    return errorResponse("INVALID_INPUT", "subjectId and url are required.", 400);
  }
  try {
    new URL(url);
  } catch {
    return errorResponse("INVALID_INPUT", "That doesn't look like a valid URL.", 400);
  }

  const db = getDb();
  const subject = db.prepare(`SELECT id FROM subjects WHERE id = ?`).get(subjectId);
  if (!subject) return errorResponse("NOT_FOUND", "No such subject.", 404);

  const id = randomUUID();
  db.prepare(`INSERT INTO curriculum_links (id, subject_id, url, label, added_by) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    subjectId,
    url,
    label,
    actorId
  );

  const row = db.prepare(`SELECT * FROM curriculum_links WHERE id = ?`).get(id) as LinkRow;
  return NextResponse.json(toResponse(row), { status: 201 });
}
