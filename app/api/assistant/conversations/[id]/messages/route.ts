// Send a message and stream the Assistant's reply back — per
// AI_Architecture.md, "Responses are streamed to the UI rather than
// returned whole, for a faster-feeling experience."

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { isAiEnabledForUser, streamAssistantReply } from "@/lib/core/ai";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  if (!(await isAiEnabledForUser(actor.id))) {
    return errorResponse("AI_DISABLED", "The Assistant is turned off for your account.", 403);
  }

  const db = getDb();
  const conversation = db.prepare(`SELECT id, user_id, title FROM conversations WHERE id = ?`).get(id) as
    | { id: string; user_id: string; title: string | null }
    | undefined;
  if (!conversation) return errorResponse("NOT_FOUND", "No such conversation.", 404);
  if (conversation.user_id !== actor.id) {
    return errorResponse("FORBIDDEN", "This conversation belongs to someone else.", 403);
  }

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return errorResponse("INVALID_INPUT", "Message content is required.", 400);

  // created_at is set explicitly (not left to the schema's datetime('now')
  // default) to match the ISO format every assistant-reply INSERT already
  // uses (lib/core/ai/index.ts, the escalate route) — mixing formats on
  // this TEXT column is a real bug, not just a style nit: 'datetime(now)'
  // produces "2026-08-01 05:37:01" (space-separated), toISOString()
  // produces "2026-08-01T05:36:46.767Z". Lexicographic ORDER BY created_at
  // then sorts by the separator character first (' ' < 'T' in ASCII), so a
  // user message can sort *before* an assistant reply that actually
  // preceded it by seconds — scrambling both the model's own conversation
  // history and the chat UI's message order (root cause of a real user
  // report: "the assistant doesn't see previous chats... the question I'm
  // asking disappears", 2026-08-01).
  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`).run(
    randomUUID(),
    id,
    content,
    new Date().toISOString()
  );

  // Auto-generate the conversation title from its first message — Assistant.md
  // left this as an open question; resolving it this way matches typical
  // chat-tool behavior and needs no extra step from the user.
  if (!conversation.title) {
    const title = content.length > 48 ? `${content.slice(0, 48)}…` : content;
    db.prepare(`UPDATE conversations SET title = ? WHERE id = ?`).run(title, id);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of streamAssistantReply(actor.id, id)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("[assistant] Failed to stream reply:", err);
        controller.enqueue(encoder.encode("\n\n[The Assistant hit an error responding. Please try again.]"));
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
