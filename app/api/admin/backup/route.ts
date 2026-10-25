// Backup screen API. See docs/06_Admin/Backup.md — status/list is Super
// Admin only per Authorization.md's "Inherently Super Admin-Only: Access to
// technical admin tools — backups, system logs, monitoring."

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { runBackup, listBackups } from "@/lib/core/backup";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

async function requireSuperAdmin(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return { error: errorResponse("UNAUTHENTICATED", "Login required.", 401) };
  if (actor.role !== "super_admin") {
    return { error: errorResponse("FORBIDDEN", "Only the Super Admin can access backups.", 403) };
  }
  return { actor };
}

export async function GET(req: NextRequest) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  const backups = await listBackups();
  return NextResponse.json(backups);
}

/** Manual "back up now" — the scheduled daily run (scripts/scheduler-hourly.ts) covers the automatic case. */
export async function POST(req: NextRequest) {
  const { error, actor } = await requireSuperAdmin(req);
  if (error) return error;

  const meta = await runBackup(actor!.id);
  return NextResponse.json(meta, { status: meta.status === "success" ? 201 : 500 });
}
