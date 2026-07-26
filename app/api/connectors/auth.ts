// Shared connector auth helper. Pulled out of the route files because
// Next.js's route type-checking rejects any export from a route.ts file
// other than the HTTP verb handlers.

import { NextRequest, NextResponse } from "next/server";
import { authenticateConnector, type ConnectorDevice } from "@/lib/core/connectors";

export function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Every connector route authenticates the same way: x-device-id / x-device-token headers, not a session cookie. */
export function requireConnectorAuth(req: NextRequest): { device: ConnectorDevice } | { error: NextResponse } {
  const deviceId = req.headers.get("x-device-id") ?? "";
  const token = req.headers.get("x-device-token") ?? "";

  const device = authenticateConnector(deviceId, token);
  if (!device) {
    return { error: errorResponse("UNAUTHENTICATED", "Unknown device, revoked device, or invalid token.", 401) };
  }
  return { device };
}
