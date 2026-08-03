// Single-message API — thumbs up/down on an Assistant reply. See
// db/schema.sql's messages.feedback comment: distinct from
// ai_suggestions.feedback (a separate system for Advisor suggestion cards).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const VALID_FEEDBACK = ["thumbs_up", "thumbs_down"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const conversation = db.prepare(`SELECT id, user_id FROM conversations WHERE id = ?`).get(id) as
    | { id: string; user_id: string }
    | undefined;
  if (!conversation) return errorResponse("NOT_FOUND", "No such conversation.", 404);
  if (conversation.user_id !== actor.id) {
    return errorResponse("FORBIDDEN", "This conversation belongs to someone else.", 403);
  }

  const message = db
    .prepare(`SELECT id, role FROM messages WHERE id = ? AND conversation_id = ?`)
    .get(messageId, id) as { id: string; role: string } | undefined;
  if (!message) return errorResponse("NOT_FOUND", "No such message.", 404);
  if (message.role !== "assistant") {
    return errorResponse("INVALID_INPUT", "Only an Assistant reply can receive feedback.", 400);
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.feedback !== "string" || !VALID_FEEDBACK.includes(body.feedback)) {
    return errorResponse("INVALID_INPUT", "feedback must be 'thumbs_up' or 'thumbs_down'.", 400);
  }

  db.prepare(`UPDATE messages SET feedback = ? WHERE id = ?`).run(body.feedback, messageId);

  return NextResponse.json({ id: messageId, feedback: body.feedback });
}
