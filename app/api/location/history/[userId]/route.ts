// 7-day location history for one family member. Super Admin only — see
// docs/02_Modules/Location_Tracking.md's Permissions section: deliberately
// not the existing viewChildActivityLogs grantable permission, which scopes
// a parent-role Admin to their own children for a different kind of log.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { getLocationHistory } from "@/lib/core/location";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") return errorResponse("FORBIDDEN", "Location history is Super Admin only.", 403);

  const { userId } = await params;
  return NextResponse.json(getLocationHistory(userId));
}
