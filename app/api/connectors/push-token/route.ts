// The phone connector reports its native FCM device token here so the host can
// wake it for an on-demand location refresh. See
// docs/02_Modules/Location_Tracking.md. Same device-authenticated pattern as
// the other connector routes (no session cookie — see middleware.ts).

import { NextRequest, NextResponse } from "next/server";
import { savePushToken } from "@/lib/core/location";
import { requireConnectorAuth, errorResponse } from "../auth";

export async function POST(req: NextRequest) {
  const auth = requireConnectorAuth(req);
  if ("error" in auth) return auth.error;
  if (auth.device.deviceType !== "phone") {
    return errorResponse("INVALID_INPUT", "Only phone connectors can register a push token.", 400);
  }

  const body = await req.json().catch(() => null);
  const token = body?.token;
  // FCM tokens are a few hundred chars; the bound is only to refuse junk.
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    return errorResponse("INVALID_INPUT", "token (string) is required.", 400);
  }

  savePushToken(auth.device.id, token);
  return NextResponse.json({ ok: true });
}
