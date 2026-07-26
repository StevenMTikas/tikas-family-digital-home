// Live email summary — separate from GET /api/email so a slow/failed IMAP
// round-trip doesn't block loading the account's connection status.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { getAccountForUser, fetchEmailSummary } from "@/lib/core/email";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const account = getAccountForUser(actor.id);
  if (!account || account.status !== "connected") {
    return errorResponse("NOT_CONNECTED", "No connected email account.", 404);
  }

  try {
    const summary = await fetchEmailSummary(actor.id);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[email] Failed to fetch summary:", err);
    return errorResponse("FETCH_FAILED", "Couldn't fetch your email summary right now.", 503);
  }
}
