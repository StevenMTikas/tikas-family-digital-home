// TEMPORARY diagnostic endpoint for verifying the push-triggered location
// refresh on a real phone — see mobile-connector/src/debug-log.ts for why it
// stays for now and exactly when to remove it (this route, the table, and the
// phone-side calls all go together).

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { requireConnectorAuth, errorResponse } from "../auth";

export async function POST(req: NextRequest) {
  const auth = requireConnectorAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const eventType = body?.eventType;
  if (typeof eventType !== "string" || !eventType) {
    return errorResponse("INVALID_INPUT", "eventType (string) is required.", 400);
  }

  getDb()
    .prepare(`INSERT INTO connector_debug_logs (id, device_id, event_type, detail) VALUES (?, ?, ?, ?)`)
    .run(randomUUID(), auth.device.id, eventType, body?.detail ? JSON.stringify(body.detail) : null);

  return NextResponse.json({ ok: true });
}
