// Current family locations. See docs/02_Modules/Location_Tracking.md —
// mutual visibility: any authenticated family member (any role except
// external_viewer, which has no access to this module) sees every other
// family member's latest position, excluding anyone who has sharing off.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { getCurrentFamilyLocations } from "@/lib/core/location";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role === "external_viewer") return errorResponse("FORBIDDEN", "Not available to external viewers.", 403);

  return NextResponse.json(getCurrentFamilyLocations());
}
