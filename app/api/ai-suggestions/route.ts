// AI_Suggestions API. See docs/05_AI/AI_Suggestions.md (lifecycle) and
// docs/05_AI/Advisor.md (generation) — suggestions are scoped to the user
// they were generated for, same as everything else.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface SuggestionRow {
  id: string;
  module: string | null;
  trigger_type: string | null;
  content: string;
  generated_at: string;
  expired: number;
  expired_reason: string | null;
  accepted_at: string | null;
  feedback: string;
  related_entity_id: string | null;
}

function toResponse(row: SuggestionRow) {
  return {
    id: row.id,
    module: row.module,
    triggerType: row.trigger_type,
    content: row.content,
    generatedAt: row.generated_at,
    expired: !!row.expired,
    expiredReason: row.expired_reason,
    acceptedAt: row.accepted_at,
    feedback: row.feedback,
    relatedEntityId: row.related_entity_id,
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  // "active" (default): still live, no feedback yet, shown on Dashboard/
  // contextually. "all": every suggestion ever generated for this user,
  // for AI.md's "Suggestion History" view.
  const status = req.nextUrl.searchParams.get("status") === "all" ? "all" : "active";

  const rows = getDb()
    .prepare(
      status === "active"
        ? `SELECT * FROM ai_suggestions WHERE user_id = ? AND expired = 0 AND feedback = 'none' ORDER BY relevancy_score DESC, generated_at DESC LIMIT 10`
        : `SELECT * FROM ai_suggestions WHERE user_id = ? ORDER BY generated_at DESC`
    )
    .all(actor.id) as SuggestionRow[];

  return NextResponse.json(rows.map(toResponse));
}
