// AI_Memory API. See docs/05_AI/AI_Memory.md: "View: every user can view
// their own AI_Memory" — no separate route for viewing someone else's for
// MVP (that's an Administration-side capability not built yet).

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { getTopMemories } from "@/lib/core/ai/memory";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  // High limit — this is "browse my own memory," not the AI's working context.
  const memories = await getTopMemories(actor.id, 500);
  return NextResponse.json(memories);
}
