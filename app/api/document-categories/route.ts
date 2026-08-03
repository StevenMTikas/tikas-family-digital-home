// Document Categories API — the manageable list backing documents.category.
// See db/schema.sql's document_categories comment. Listing is open to any
// logged-in user (the Edit Document picker needs it); rename/delete are
// Super Admin only (app/api/document-categories/[id]/route.ts).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface CategoryRow {
  id: string;
  name: string;
  document_count: number;
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const rows = getDb()
    .prepare(
      `SELECT dc.id, dc.name, COUNT(d.id) AS document_count
       FROM document_categories dc
       LEFT JOIN documents d ON d.category = dc.name
       GROUP BY dc.id
       ORDER BY dc.name COLLATE NOCASE`
    )
    .all() as CategoryRow[];

  return NextResponse.json(rows.map((r) => ({ id: r.id, name: r.name, documentCount: r.document_count })));
}
