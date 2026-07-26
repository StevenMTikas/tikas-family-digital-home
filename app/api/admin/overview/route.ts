// Administration Overview (Admin Dashboard) API. See docs/06_Admin/Admin_Dashboard.md
// — urgent alerts front-and-center, a passive notifications feed, and a
// system health summary (Super Admin only for the health card). Reads
// straight from the `notifications` table Guardian already writes to
// (docs/05_AI/Guardian.md) — Notifications.md itself isn't built yet
// (Phase 6), so this is a narrow, admin-scoped read, not that module.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { getLatestHealthSnapshot } from "@/lib/core/ai/guardian";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface NotificationRow {
  id: string;
  text: string;
  created_at: string;
  severity: "routine" | "urgent";
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can view the Administration overview.", 403);
  }

  const db = getDb();
  const urgent = db
    .prepare(`SELECT id, text, created_at, severity FROM notifications WHERE user_id = ? AND severity = 'urgent' ORDER BY created_at DESC LIMIT 10`)
    .all(actor.id) as NotificationRow[];
  const passive = db
    .prepare(`SELECT id, text, created_at, severity FROM notifications WHERE user_id = ? AND severity = 'routine' ORDER BY created_at DESC LIMIT 10`)
    .all(actor.id) as NotificationRow[];

  const { checkedAt, health } = await getLatestHealthSnapshot();

  return NextResponse.json({
    urgentNotifications: urgent.map((n) => ({ id: n.id, text: n.text, createdAt: n.created_at })),
    passiveNotifications: passive.map((n) => ({ id: n.id, text: n.text, createdAt: n.created_at })),
    health,
    checkedAt,
  });
}
