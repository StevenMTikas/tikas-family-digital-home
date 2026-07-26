// Registers a browser's push subscription for the logged-in user. See
// docs/02_Modules/Notifications.md's "Android push for MVP" and
// lib/core/push.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { saveSubscription } from "@/lib/core/push";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";

  if (!endpoint || !p256dh || !auth) {
    return errorResponse("INVALID_INPUT", "endpoint and keys.p256dh/keys.auth are required.", 400);
  }

  saveSubscription(actor.id, { endpoint, keys: { p256dh, auth } });
  return NextResponse.json({ subscribed: true });
}
