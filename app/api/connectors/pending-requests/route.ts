// Lightweight "anything requested?" poll — separate from the once-daily
// full sync, this is what lets an on-demand file open resolve sooner than
// the next scheduled sync. See File_Connector_Architecture.md's Sync
// Mechanics section (resolved "no manual sync" tension).

import { NextRequest, NextResponse } from "next/server";
import { getPendingFileRequests } from "@/lib/core/connectors";
import { requireConnectorAuth } from "../auth";

export async function GET(req: NextRequest) {
  const auth = requireConnectorAuth(req);
  if ("error" in auth) return auth.error;

  return NextResponse.json(getPendingFileRequests(auth.device));
}
