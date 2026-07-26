// Internet Access screen API. See docs/06_Admin/Internet_Access.md — current
// state of everything that reaches outside the home: permission holders,
// active Standing Integration Connections, recent outside-call activity.
// Super Admin only.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface PermissionHolderRow {
  id: string;
  full_name: string;
  approve_outside_calls: number;
  approve_sensitive_outside_transmission: number;
}

interface ConnectionRow {
  id: string;
  user_id: string;
  full_name: string;
  provider: string;
  email_address: string;
  connected_at: string;
}

interface ActivityRow {
  id: string;
  type: string;
  user_id: string | null;
  full_name: string | null;
  detail: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can view Internet Access.", 403);
  }

  const db = getDb();

  const holders = db
    .prepare(
      `SELECT id, full_name, approve_outside_calls, approve_sensitive_outside_transmission
       FROM users WHERE approve_outside_calls = 1 OR approve_sensitive_outside_transmission = 1`
    )
    .all() as PermissionHolderRow[];

  // Standing Integration Connections, per Security_Architecture.md's general
  // model — currently just Email accounts. No Weather row: Dashboard.md's
  // weather integration isn't built yet (Phase 6), so there's honestly
  // nothing there to list yet, rather than a placeholder row.
  const connections = db
    .prepare(
      `SELECT ea.id, ea.user_id, u.full_name, ea.provider, ea.email_address, ea.connected_at
       FROM email_accounts ea JOIN users u ON u.id = ea.user_id
       WHERE ea.status = 'connected'
       ORDER BY ea.connected_at DESC`
    )
    .all() as ConnectionRow[];

  const recentActivity = db
    .prepare(
      `SELECT e.id, e.type, e.user_id, u.full_name, e.detail, e.created_at
       FROM security_events e LEFT JOIN users u ON u.id = e.user_id
       WHERE e.type IN ('outside_call_approved', 'outside_call_denied', 'outside_call_blocked')
       ORDER BY e.created_at DESC LIMIT 10`
    )
    .all() as ActivityRow[];

  return NextResponse.json({
    permissionHolders: holders.map((h) => ({
      id: h.id,
      fullName: h.full_name,
      approveOutsideCalls: !!h.approve_outside_calls,
      approveSensitiveOutsideTransmission: !!h.approve_sensitive_outside_transmission,
    })),
    connections: connections.map((c) => ({
      id: c.id,
      userId: c.user_id,
      userName: c.full_name,
      provider: c.provider,
      emailAddress: c.email_address,
      connectedAt: c.connected_at,
    })),
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      type: a.type,
      userId: a.user_id,
      userName: a.full_name,
      detail: a.detail ? JSON.parse(a.detail) : null,
      createdAt: a.created_at,
    })),
  });
}
