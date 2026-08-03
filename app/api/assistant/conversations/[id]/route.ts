// Single-conversation API — fetch a conversation's message history. Private
// to its owner, per Assistant.md (no admin override for MVP).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, hasPermission } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const conversation = db.prepare(`SELECT id, user_id, title FROM conversations WHERE id = ?`).get(id) as
    | { id: string; user_id: string; title: string | null }
    | undefined;
  if (!conversation) return errorResponse("NOT_FOUND", "No such conversation.", 404);
  if (conversation.user_id !== actor.id) {
    return errorResponse("FORBIDDEN", "This conversation belongs to someone else.", 403);
  }

  const messages = db
    .prepare(`SELECT id, role, content, created_at, feedback, source FROM messages WHERE conversation_id = ? ORDER BY created_at`)
    .all(id) as { id: string; role: string; content: string; created_at: string; feedback: string | null; source: string }[];

  // Per AI_Permissions.md: escalating sends real AI_Memory content outbound,
  // so it needs both the general outside-call permission and the stricter
  // sensitive-data gate — same combination checked server-side again before
  // an escalation actually runs (escalate/route.ts). Computed once per actor
  // here so the UI can hide the option entirely for anyone without it.
  const canEscalate = hasPermission(actor, "approveOutsideCalls") && hasPermission(actor, "approveSensitiveOutsideTransmission");

  return NextResponse.json({
    id: conversation.id,
    title: conversation.title,
    canEscalate,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
      feedback: m.feedback,
      source: m.source,
    })),
  });
}
