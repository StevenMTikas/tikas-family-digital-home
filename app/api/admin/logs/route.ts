// Logs screen API. See docs/06_Admin/Logs.md — full security event log,
// filterable by type and user, Super Admin only, 30-day retention (purge is
// handled by lib/core/logging's scheduled purgeOldSecurityEvents, not this route).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface EventRow {
  id: string;
  type: string;
  user_id: string | null;
  detail: string | null;
  created_at: string;
  full_name: string | null;
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  // Logs.md: "Super Admin only" — full technical log, distinct from a
  // scoped Admin's narrower view_child_activity_logs capability.
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can view the full security log.", 403);
  }

  const type = req.nextUrl.searchParams.get("type");
  const userId = req.nextUrl.searchParams.get("userId");

  const conditions: string[] = [];
  const params: string[] = [];
  if (type) {
    conditions.push("e.type = ?");
    params.push(type);
  }
  if (userId) {
    conditions.push("e.user_id = ?");
    params.push(userId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = getDb()
    .prepare(
      `SELECT e.id, e.type, e.user_id, e.detail, e.created_at, u.full_name
       FROM security_events e
       LEFT JOIN users u ON u.id = e.user_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT 500`
    )
    .all(...params) as EventRow[];

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      type: row.type,
      userId: row.user_id,
      userName: row.full_name,
      detail: row.detail ? JSON.parse(row.detail) : null,
      createdAt: row.created_at,
    }))
  );
}
