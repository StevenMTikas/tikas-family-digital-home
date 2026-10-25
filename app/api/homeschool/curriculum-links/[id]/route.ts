import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "admin" && actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin can remove a curriculum link.", 403);
  }

  const db = getDb();
  const row = db.prepare(`SELECT id FROM curriculum_links WHERE id = ?`).get(id);
  if (!row) return errorResponse("NOT_FOUND", "No such curriculum link.", 404);

  db.prepare(`DELETE FROM curriculum_links WHERE id = ?`).run(id);
  return new NextResponse(null, { status: 204 });
}
