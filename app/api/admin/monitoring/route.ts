// Monitoring screen API. See docs/06_Admin/Monitoring.md — "displays the
// results of Guardian's existing scheduled monitoring pass," no new entity.
// Super Admin only.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { getLatestHealthSnapshot } from "@/lib/core/ai/guardian";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can view system monitoring.", 403);
  }

  const { checkedAt, health } = await getLatestHealthSnapshot();
  return NextResponse.json({ checkedAt, health });
}
