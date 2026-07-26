// Assistant conversations API. See docs/05_AI/Assistant.md: chat history is
// private to the user who created it — "no other family member can read
// someone else's Assistant conversations, including admins."

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { isAiEnabledForUser } from "@/lib/core/ai";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface ConversationRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const rows = getDb()
    .prepare(`SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC`)
    .all(actor.id) as ConversationRow[];

  return NextResponse.json(
    rows.map((r) => ({ id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at }))
  );
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  if (!(await isAiEnabledForUser(actor.id))) {
    return errorResponse("AI_DISABLED", "The Assistant is turned off for your account.", 403);
  }

  const db = getDb();
  const id = randomUUID();
  db.prepare(`INSERT INTO conversations (id, user_id, title) VALUES (?, ?, NULL)`).run(id, actor.id);

  const row = db.prepare(`SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?`).get(id) as ConversationRow;
  return NextResponse.json(
    { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at },
    { status: 201 }
  );
}
