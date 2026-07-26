// Manual restore — Super-Admin-only, confirmation-gated in the UI before
// this is ever called (Backup.md). Destructive: overwrites the live DB and
// uploaded files, though lib/core/backup.restoreBackup keeps a pre-restore
// safety copy of both before doing so.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { logSecurityEvent } from "@/lib/core/logging";
import { restoreBackup, listBackups } from "@/lib/core/backup";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can restore from a backup.", 403);
  }

  const body = await req.json().catch(() => null);
  const backupId = typeof body?.backupId === "string" ? body.backupId : "";
  if (!backupId) return errorResponse("INVALID_INPUT", "backupId is required.", 400);

  const known = await listBackups();
  const target = known.find((b) => b.id === backupId);
  if (!target) return errorResponse("NOT_FOUND", "No such backup.", 404);
  if (target.status !== "success") {
    return errorResponse("INVALID_STATE", "Can't restore from a failed backup.", 409);
  }

  try {
    await restoreBackup(backupId);
  } catch (err) {
    return errorResponse("RESTORE_FAILED", err instanceof Error ? err.message : "Restore failed.", 500);
  }

  // Note: restoreBackup() closes and reopens the DB connection, so this log
  // entry is written to the freshly-restored database, not the pre-restore one.
  await logSecurityEvent({ type: "backup_restored", userId: actor.id, detail: { backupId } });

  return NextResponse.json({ restored: backupId });
}
