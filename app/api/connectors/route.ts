// Connector API — deliberately SEPARATE from the main module API pattern.
// This is the internal, minimal API that connectors (on the other computers
// and phones) sync to once per day, no retry. Do NOT entangle this with the
// full frontend API surface. See docs/01_System_Architecture/
// File_Connector_Architecture.md and Application_Architecture.md
// ("Connector Communication").

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // TODO: verify device trust (Security_Architecture.md) before accepting
  // any sync payload. Metadata only — no full files at sync time, per
  // File_Connector_Architecture.md.
  return NextResponse.json(
    { error: { code: "NOT_IMPLEMENTED", message: "Connector sync not yet implemented" } },
    { status: 501 }
  );
}
