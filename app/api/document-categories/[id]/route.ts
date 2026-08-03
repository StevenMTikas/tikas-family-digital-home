// Single Document Category API — rename (cascades to every document using
// it) and delete (blocked while any document still uses it). Both Super
// Admin only: a rename or delete here changes shared state every family
// member's documents rely on, same reasoning as document sensitivity being
// Super-Admin-only (app/api/documents/[id]/route.ts).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { indexContent } from "@/lib/core/search";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface CategoryRow {
  id: string;
  name: string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can rename a category.", 403);
  }

  const db = getDb();
  const row = db.prepare(`SELECT id, name FROM document_categories WHERE id = ?`).get(id) as CategoryRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such category.", 404);

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return errorResponse("INVALID_INPUT", "A name is required.", 400);

  if (name !== row.name) {
    const conflict = db.prepare(`SELECT id FROM document_categories WHERE name = ? AND id != ?`).get(name, id);
    if (conflict) return errorResponse("CONFLICT", `"${name}" is already used by another category.`, 409);

    db.prepare(`UPDATE document_categories SET name = ? WHERE id = ?`).run(name, id);
    db.prepare(`UPDATE documents SET category = ? WHERE category = ?`).run(name, row.name);

    const affected = db.prepare(`SELECT id, title FROM documents WHERE category = ?`).all(name) as {
      id: string;
      title: string;
    }[];
    for (const doc of affected) {
      indexContent("document", doc.id, `${doc.title} ${name}`).catch((err) =>
        console.error("[search] Failed to re-index renamed-category document:", err)
      );
    }
  }

  const documentCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM documents WHERE category = ?`).get(name) as { c: number }
  ).c;

  return NextResponse.json({ id, name, documentCount });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can delete a category.", 403);
  }

  const db = getDb();
  const row = db.prepare(`SELECT id, name FROM document_categories WHERE id = ?`).get(id) as CategoryRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such category.", 404);

  const documentCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM documents WHERE category = ?`).get(row.name) as { c: number }
  ).c;
  if (documentCount > 0) {
    return errorResponse(
      "IN_USE",
      `${documentCount} document${documentCount === 1 ? "" : "s"} still use${documentCount === 1 ? "s" : ""} this category — recategorize them first.`,
      409
    );
  }

  db.prepare(`DELETE FROM document_categories WHERE id = ?`).run(id);
  return new NextResponse(null, { status: 204 });
}
