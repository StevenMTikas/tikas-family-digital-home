// Location-sharing toggle. See docs/02_Modules/Location_Tracking.md — same
// simple own-account-only pattern as app/api/ai-settings/route.ts's
// ai_enabled toggle, except a minor's account is server-side blocked from
// ever turning it off (Location_Tracking.md's Permissions section).

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { getLocationSharingEnabled, setLocationSharingEnabled, isMinor } from "@/lib/core/location";
import { getDb } from "@/db/client";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const row = getDb().prepare(`SELECT date_of_birth FROM users WHERE id = ?`).get(actor.id) as
    | { date_of_birth: string | null }
    | undefined;

  return NextResponse.json({
    locationSharingEnabled: getLocationSharingEnabled(actor.id),
    isMinor: isMinor(row?.date_of_birth ?? null),
  });
}

export async function PATCH(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const body = await req.json().catch(() => null);
  if (typeof body?.locationSharingEnabled !== "boolean") {
    return errorResponse("INVALID_INPUT", "locationSharingEnabled (boolean) is required.", 400);
  }

  const err = setLocationSharingEnabled(actor, body.locationSharingEnabled);
  if (err === "minor_cannot_opt_out") {
    return errorResponse("FORBIDDEN", "A minor's account cannot turn off location sharing.", 403);
  }

  return NextResponse.json({ locationSharingEnabled: body.locationSharingEnabled });
}
