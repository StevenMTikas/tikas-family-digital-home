// Thumbs-down escalation to a frontier model — see AI_Permissions.md's
// outside-call approval flow and lib/core/ai/frontier.ts's escalateToFrontier
// comment. Real family data (AI_Memory context) leaves the house here, so
// this requires both "Approve Outside Calls" and the sensitive-data gate —
// unlike the automatic no-family-data routing in streamAssistantReply, which
// needs no approval because nothing family-specific is ever sent.
//
// Two-step: POST with no body (or confirm: false) returns a preview of
// exactly what would be sent, per AI_Permissions.md's "the approval prompt
// shows exactly what's being sent." POST with confirm: true actually sends it.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { requestOutsideCallApproval } from "@/lib/core/ai";
import { getTopMemories, formatMemoriesForPrompt } from "@/lib/core/ai/memory";
import { isFrontierConfigured, escalateToFrontier } from "@/lib/core/ai/frontier";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  created_at: string;
  source: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  if (!isFrontierConfigured()) {
    return errorResponse("NOT_CONFIGURED", "No frontier model connection is set up for this household yet.", 503);
  }

  const db = getDb();
  const conversation = db.prepare(`SELECT id, user_id FROM conversations WHERE id = ?`).get(id) as
    | { id: string; user_id: string }
    | undefined;
  if (!conversation) return errorResponse("NOT_FOUND", "No such conversation.", 404);
  if (conversation.user_id !== actor.id) {
    return errorResponse("FORBIDDEN", "This conversation belongs to someone else.", 403);
  }

  const allMessages = db
    .prepare(`SELECT id, role, content, created_at, source FROM messages WHERE conversation_id = ? ORDER BY created_at`)
    .all(id) as MessageRow[];
  const replyIndex = allMessages.findIndex((m) => m.id === messageId);
  const reply = replyIndex >= 0 ? allMessages[replyIndex] : undefined;
  if (!reply) return errorResponse("NOT_FOUND", "No such message.", 404);
  if (reply.role !== "assistant" || reply.source !== "local") {
    return errorResponse("INVALID_INPUT", "Only a local-model reply can be escalated.", 400);
  }

  // The immediately preceding row is normally the question this reply
  // answered. It can be a non-user row (or missing) for an older
  // conversation where a prior local-model failure left an orphaned user
  // message with no reply attached — a real, if rare, gap in the messages
  // table's ordering guarantee, not a server bug, so this is a client error.
  const question = replyIndex > 0 ? allMessages[replyIndex - 1] : undefined;
  if (!question || question.role !== "user") {
    return errorResponse("INVALID_INPUT", "This reply's original question can't be found, so it can't be escalated.", 400);
  }

  // AI_Memory content is treated as sensitive by default whenever it's sent
  // outbound, the same way photo-to-event extraction already is
  // (AI_Permissions.md) — so the stricter gate applies even though this
  // isn't marked sensitive at the source. Categorically unavailable to a
  // minor's account regardless of "Approve Outside Calls".
  const approved = await requestOutsideCallApproval(
    { userId: actor.id, agent: "assistant" },
    "Escalate an Assistant reply to a frontier model (thumbs-down second opinion)",
    true
  );
  if (!approved) {
    return errorResponse(
      "FORBIDDEN",
      "Only someone with the Approve Outside Calls and sensitive-data permissions can escalate to a frontier model.",
      403
    );
  }

  // Re-fetched fresh rather than reconstructed from when the original reply
  // was generated — simpler, and "what the local model currently knows"
  // is a reasonable stand-in for "what it knew," which may have decayed or
  // changed since.
  const memories = await getTopMemories(actor.id);
  const memoryContext = formatMemoriesForPrompt(memories);

  const body = await req.json().catch(() => null);
  if (body?.confirm !== true) {
    return NextResponse.json({
      question: question.content,
      localAnswer: reply.content,
      memoryFacts: memories.map((m) => m.fact),
    });
  }

  const frontierAnswer = await escalateToFrontier(question.content, memoryContext, reply.content);

  const newMessageId = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, source) VALUES (?, ?, 'assistant', ?, ?, 'frontier')`
  ).run(newMessageId, id, frontierAnswer, now);
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, id);

  return NextResponse.json({
    id: newMessageId,
    role: "assistant",
    content: frontierAnswer,
    createdAt: now,
    source: "frontier",
  });
}
