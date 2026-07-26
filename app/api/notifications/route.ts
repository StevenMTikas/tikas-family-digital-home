// Recent Notifications list — Notifications.md's capped "last 10" list.
// See lib/core/notifications for the cap/delivery logic itself.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { getRecentNotifications } from "@/lib/core/notifications";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  return NextResponse.json(getRecentNotifications(actor.id));
}
