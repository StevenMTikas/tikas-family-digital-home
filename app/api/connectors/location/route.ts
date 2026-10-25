// Connector location reporting. See docs/02_Modules/Location_Tracking.md —
// deliberately separate from app/api/connectors/sync's file-metadata batch:
// different cadence, different retention (7-day purge, not permanent),
// different sensitivity (never read by lib/core/ai/*).
//
// Same connector-auth pattern as sync/pending-requests/file — a phone isn't
// a logged-in family member, so it authenticates with its device id + token
// rather than a session cookie (see middleware.ts's api/connectors exclusion).

import { NextRequest, NextResponse } from "next/server";
import { recordLocationReport } from "@/lib/core/location";
import { requireConnectorAuth, errorResponse } from "../auth";

export async function POST(req: NextRequest) {
  const auth = requireConnectorAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const latitude = body?.latitude;
  const longitude = body?.longitude;
  const recordedAt = body?.recordedAt;

  if (typeof latitude !== "number" || typeof longitude !== "number" || typeof recordedAt !== "string") {
    return errorResponse("INVALID_INPUT", "latitude (number), longitude (number), and recordedAt (ISO string) are required.", 400);
  }
  const accuracyM = typeof body?.accuracyM === "number" ? body.accuracyM : undefined;

  recordLocationReport(auth.device, { latitude, longitude, accuracyM, recordedAt });
  return NextResponse.json({ ok: true });
}
