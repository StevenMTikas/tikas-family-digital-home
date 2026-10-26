// Asks family members' phones for a fresh location reading. See
// docs/02_Modules/Location_Tracking.md. Called automatically when /location
// opens (stale readings only) and by the per-person Refresh button (`userId`
// given → skips the staleness check; the per-phone rate limit still applies).
//
// Any authenticated family member may call this — it's the same "everyone can
// see everyone" visibility rule as GET /api/location — but it only ever
// pushes to users who are sharing their location.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { requestLocationRefresh } from "@/lib/core/location/refresh";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role === "external_viewer") return errorResponse("FORBIDDEN", "Not available to external viewers.", 403);

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : undefined;

  const result = await requestLocationRefresh({ onlyUserId: userId, force: !!userId });
  return NextResponse.json(result);
}
