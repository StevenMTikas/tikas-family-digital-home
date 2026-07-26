// Family Knowledge API (general items). See docs/02_Modules/Family_Knowledge.md:
// "View/Edit/Delete: governed by folder permissions" — unlike Documents,
// anyone with folder Edit access can edit any item in it, not just its creator.
// Password Entries are a separate resource — see ./passwords.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser, canAccessFolder } from "@/lib/core/permissions";
import { getDefaultFolderId } from "@/lib/folders/default-folder";
import { indexContent } from "@/lib/core/search";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface ItemRow {
  id: string;
  category: string | null;
  title: string;
  content: string | null;
  is_sensitive: number;
  folder_id: string | null;
  created_by: string;
  updated_at: string;
}

function toItemResponse(row: ItemRow, canEdit: boolean, canDelete: boolean) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    isSensitive: !!row.is_sensitive,
    folderId: row.folder_id,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    canEdit,
    canDelete,
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const rows = getDb().prepare(`SELECT * FROM family_knowledge_items ORDER BY updated_at DESC`).all() as ItemRow[];

  const result = [];
  for (const row of rows) {
    if (!row.folder_id) continue;
    const ctx = { userId: actor.id };
    if (!(await canAccessFolder(ctx, row.folder_id, "view"))) continue;
    const canEdit = await canAccessFolder(ctx, row.folder_id, "edit");
    const canDelete = await canAccessFolder(ctx, row.folder_id, "delete");
    result.push(toItemResponse(row, canEdit, canDelete));
  }

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const folderId = getDefaultFolderId(db);
  if (!folderId) return errorResponse("NO_FOLDER", "No folder exists to create this in yet.", 500);

  if (!(await canAccessFolder({ userId: actorId }, folderId, "edit"))) {
    return errorResponse("FORBIDDEN", "You don't have Edit access to this folder.", 403);
  }

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() || null : null;
  const content = typeof body?.content === "string" ? body.content.trim() || null : null;
  const isSensitive = body?.isSensitive === true;

  if (!title) return errorResponse("INVALID_INPUT", "A title is required.", 400);

  const id = randomUUID();
  db.prepare(
    `INSERT INTO family_knowledge_items (id, category, title, content, is_sensitive, folder_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, category, title, content, isSensitive ? 1 : 0, folderId, actorId);

  const row = db.prepare(`SELECT * FROM family_knowledge_items WHERE id = ?`).get(id) as ItemRow;
  indexContent("family_knowledge", id, `${row.title} ${row.category ?? ""} ${row.content ?? ""}`).catch((err) =>
    console.error("[search] Failed to index family knowledge item:", err)
  );
  return NextResponse.json(toItemResponse(row, true, true), { status: 201 });
}
