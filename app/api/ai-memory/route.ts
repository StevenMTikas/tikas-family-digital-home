// AI_Memory API. See docs/05_AI/AI_Memory.md: "View: every user can view
// their own AI_Memory" — plus, per the household's general visibility rule
// (2026-08-01), a Super Admin can view anyone's, and an Admin can view a
// user in their admin_scope if also individually granted "View Child
// Activity Logs" (Authorization.md).

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, hasAdminAuthorityOver, hasPermission } from "@/lib/core/permissions";
import { getTopMemories } from "@/lib/core/ai/memory";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const requestedUserId = req.nextUrl.searchParams.get("userId");
  const targetId = requestedUserId || actor.id;

  if (targetId !== actor.id && !(hasAdminAuthorityOver(actor, targetId) && hasPermission(actor, "viewChildActivityLogs"))) {
    return errorResponse("FORBIDDEN", "You don't have permission to view that person's AI Memory.", 403);
  }

  // High limit — this is "browse a profile," not the AI's working context.
  const memories = await getTopMemories(targetId, 500);
  return NextResponse.json(memories);
}
