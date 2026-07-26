// Single AI_Suggestion API — feedback and acceptance. See AI_Suggestions.md:
// dismiss and thumbs-down are distinct signals; accepting records when the
// user was routed to act, it never finalizes the action itself.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const VALID_FEEDBACK = ["thumbs_up", "thumbs_down", "dismissed"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT id, user_id FROM ai_suggestions WHERE id = ?`).get(id) as
    | { id: string; user_id: string }
    | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such suggestion.", 404);
  if (row.user_id !== actor.id) {
    return errorResponse("FORBIDDEN", "This suggestion was generated for someone else.", 403);
  }

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};

  if (typeof body?.feedback === "string" && VALID_FEEDBACK.includes(body.feedback)) {
    updates.feedback = body.feedback;
    updates.feedback_at = new Date().toISOString();
  }
  if (body?.accepted === true) {
    updates.accepted_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("INVALID_INPUT", "Provide feedback or accepted.", 400);
  }

  const setClause = Object.keys(updates).map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE ai_suggestions SET ${setClause} WHERE id = @id`).run({ ...updates, id });

  const updated = db.prepare(`SELECT * FROM ai_suggestions WHERE id = ?`).get(id) as {
    id: string;
    module: string | null;
    related_entity_id: string | null;
    feedback: string;
    accepted_at: string | null;
  };

  return NextResponse.json({
    id: updated.id,
    module: updated.module,
    relatedEntityId: updated.related_entity_id,
    feedback: updated.feedback,
    acceptedAt: updated.accepted_at,
  });
}
