// AI Settings API. See docs/02_Modules/AI.md: a simple per-user on/off
// toggle — "every user can view and toggle their own ai_enabled setting; no
// special permission required... cannot toggle it for another family member."

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const row = getDb().prepare(`SELECT ai_enabled FROM users WHERE id = ?`).get(actor.id) as { ai_enabled: number };
  return NextResponse.json({ aiEnabled: !!row.ai_enabled });
}

export async function PATCH(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const body = await req.json().catch(() => null);
  if (typeof body?.aiEnabled !== "boolean") {
    return errorResponse("INVALID_INPUT", "aiEnabled (boolean) is required.", 400);
  }

  getDb().prepare(`UPDATE users SET ai_enabled = ? WHERE id = ?`).run(body.aiEnabled ? 1 : 0, actor.id);
  return NextResponse.json({ aiEnabled: body.aiEnabled });
}
