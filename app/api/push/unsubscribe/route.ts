// Removes a browser's push subscription — called when the user turns
// notifications off, or the service worker reports the subscription expired.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { removeSubscription } from "@/lib/core/push";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return errorResponse("INVALID_INPUT", "endpoint is required.", 400);

  removeSubscription(endpoint);
  return NextResponse.json({ unsubscribed: true });
}
