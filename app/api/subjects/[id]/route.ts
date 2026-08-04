// Single Subject API — rename and delete (blocked while any homework item
// still uses it). Both Super Admin only: a rename/delete here changes shared
// state every family member's homework relies on, same reasoning as Document
// Category's rename/delete (app/api/document-categories/[id]/route.ts).
//
// Unlike Document Category, homework_details stores subject_id (an FK), not
// a copied name, so a rename needs no cascade UPDATE across other rows — the
// name change alone is immediately reflected wherever subject_id is joined.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface SubjectRow {
  id: string;
  name: string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can rename a subject.", 403);
  }

  const db = getDb();
  const row = db.prepare(`SELECT id, name FROM subjects WHERE id = ?`).get(id) as SubjectRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such subject.", 404);

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return errorResponse("INVALID_INPUT", "A name is required.", 400);

  if (name !== row.name) {
    const conflict = db.prepare(`SELECT id FROM subjects WHERE name = ? AND id != ?`).get(name, id);
    if (conflict) return errorResponse("CONFLICT", `"${name}" is already used by another subject.`, 409);

    db.prepare(`UPDATE subjects SET name = ? WHERE id = ?`).run(name, id);
  }

  const homeworkCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM homework_details WHERE subject_id = ?`).get(id) as { c: number }
  ).c;

  return NextResponse.json({ id, name, homeworkCount });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can delete a subject.", 403);
  }

  const db = getDb();
  const row = db.prepare(`SELECT id, name FROM subjects WHERE id = ?`).get(id) as SubjectRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such subject.", 404);

  const homeworkCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM homework_details WHERE subject_id = ?`).get(id) as { c: number }
  ).c;
  if (homeworkCount > 0) {
    return errorResponse(
      "IN_USE",
      `${homeworkCount} homework item${homeworkCount === 1 ? "" : "s"} still use${homeworkCount === 1 ? "s" : ""} this subject — reassign them first.`,
      409
    );
  }

  db.prepare(`DELETE FROM subjects WHERE id = ?`).run(id);
  return new NextResponse(null, { status: 204 });
}
