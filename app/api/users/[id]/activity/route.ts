// A child's activity, for the Admin(s) responsible for them. See
// lib/core/logging/activity.ts and Authorization.md's view_child_activity_logs
// — Super Admin, or an Admin scoped to this user who also holds that
// individually grantable permission. Not the same as the Super-Admin-only
// full security log (app/api/admin/logs).

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { canViewActivityOf, getUserActivity } from "@/lib/core/logging/activity";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  if (!canViewActivityOf(actor, id)) {
    return errorResponse("FORBIDDEN", "You don't have permission to view that person's activity.", 403);
  }

  return NextResponse.json(getUserActivity(id));
}
