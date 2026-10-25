// Delete a single blackout range. See ../route.ts for adding one.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, hasAdminAuthorityOver } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; blackoutId: string }> }) {
  const { id, blackoutId } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const year = db.prepare(`SELECT child_id FROM school_years WHERE id = ?`).get(id) as { child_id: string } | undefined;
  if (!year) return errorResponse("NOT_FOUND", "No such school year.", 404);
  if (!hasAdminAuthorityOver(actor, year.child_id)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin over this child can edit their school year.", 403);
  }

  const row = db
    .prepare(`SELECT id FROM school_year_blackouts WHERE id = ? AND school_year_id = ?`)
    .get(blackoutId, id);
  if (!row) return errorResponse("NOT_FOUND", "No such blackout range.", 404);

  db.prepare(`DELETE FROM school_year_blackouts WHERE id = ?`).run(blackoutId);
  return new NextResponse(null, { status: 204 });
}
