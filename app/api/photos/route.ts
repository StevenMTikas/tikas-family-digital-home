// photos API. See docs/02_Modules/Photos.md and
// docs/01_System_Architecture/API_Reference.md for the conventions this
// should follow (standard REST, shared error shape, permission checks via
// /lib/core/permissions before any action).

import { NextRequest, NextResponse } from "next/server";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  return errorResponse("NOT_IMPLEMENTED", "Not yet implemented — see docs/02_Modules/Photos.md", 501);
}
