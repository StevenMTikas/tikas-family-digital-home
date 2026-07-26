// Single AI_Memory entry API. See docs/05_AI/AI_Memory.md: any user can flag
// an entry about themselves; only the Super Admin can actually edit or
// remove one (for any user, including their own, "acting in that capacity").

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface MemoryRow {
  id: string;
  user_id: string;
  fact: string;
  category: string | null;
  is_sensitive: number;
  flagged: number;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM ai_memory WHERE id = ?`).get(id) as MemoryRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such memory entry.", 404);

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};

  if (typeof body?.flagged === "boolean") {
    // Flagging is self-only — "every user can flag entries about themselves."
    if (row.user_id !== actor.id) {
      return errorResponse("FORBIDDEN", "You can only flag entries about yourself.", 403);
    }
    updates.flagged = body.flagged ? 1 : 0;
    updates.flagged_at = body.flagged ? new Date().toISOString() : null;
  }

  if (typeof body?.fact === "string" || typeof body?.category === "string" || typeof body?.isSensitive === "boolean") {
    if (actor.role !== "super_admin") {
      return errorResponse("FORBIDDEN", "Only the Super Admin can edit AI Memory entries.", 403);
    }
    if (typeof body.fact === "string" && body.fact.trim()) updates.fact = body.fact.trim();
    if (typeof body.category === "string") updates.category = body.category;
    if (typeof body.isSensitive === "boolean") updates.is_sensitive = body.isSensitive ? 1 : 0;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("INVALID_INPUT", "No changes provided.", 400);
  }

  const setClause = Object.keys(updates).map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE ai_memory SET ${setClause} WHERE id = @id`).run({ ...updates, id });

  const updated = db.prepare(`SELECT * FROM ai_memory WHERE id = ?`).get(id) as MemoryRow;
  return NextResponse.json({
    id: updated.id,
    fact: updated.fact,
    category: updated.category,
    isSensitive: !!updated.is_sensitive,
    flagged: !!updated.flagged,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can remove AI Memory entries.", 403);
  }

  const db = getDb();
  const row = db.prepare(`SELECT id FROM ai_memory WHERE id = ?`).get(id);
  if (!row) return errorResponse("NOT_FOUND", "No such memory entry.", 404);

  db.prepare(`DELETE FROM ai_memory WHERE id = ?`).run(id);
  return new NextResponse(null, { status: 204 });
}
