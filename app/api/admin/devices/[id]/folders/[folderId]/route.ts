// Remove one watched folder path — see the parent folders/route.ts for
// context. Deliberately does not touch devices.designated_folders (see
// removeWatchedPath's own comment in lib/core/connectors/index.ts).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { removeWatchedPath } from "@/lib/core/connectors";
import { logSecurityEvent } from "@/lib/core/logging";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; folderId: string }> }) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can manage devices.", 403);
  }

  const { id, folderId } = await params;
  const device = getDb().prepare(`SELECT id FROM devices WHERE id = ?`).get(id);
  if (!device) return errorResponse("NOT_FOUND", "No such device.", 404);

  removeWatchedPath(id, folderId);
  await logSecurityEvent({ type: "permission_changed", userId: actor.id, detail: { scope: "device_connector", action: "folder_removed", deviceId: id, folderId } });

  return new NextResponse(null, { status: 204 });
}
