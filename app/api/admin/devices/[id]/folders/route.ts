// Per-device watched-folder paths — the Admin-dashboard-managed alternative
// to a connector's local config.json. See File_Connector_Architecture.md's
// "Host- and Dashboard-Managed Folders" section. Super Admin only, same
// authority as the rest of device management (Security_Architecture.md).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { getWatchedPaths, addWatchedPath, unsupportedFolderTypesFor, FOLDER_TYPES, type FolderType } from "@/lib/core/connectors";
import { logSecurityEvent } from "@/lib/core/logging";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

async function requireSuperAdmin(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return { error: errorResponse("UNAUTHENTICATED", "Login required.", 401) } as const;
  if (actor.role !== "super_admin") {
    return { error: errorResponse("FORBIDDEN", "Only the Super Admin can manage devices.", 403) } as const;
  }
  return { actor } as const;
}

function loadDeviceType(id: string): "computer" | "phone" | undefined {
  const row = getDb().prepare(`SELECT device_type FROM devices WHERE id = ?`).get(id) as
    | { device_type: "computer" | "phone" }
    | undefined;
  return row?.device_type;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  const { id } = await params;
  if (!loadDeviceType(id)) return errorResponse("NOT_FOUND", "No such device.", 404);

  return NextResponse.json(getWatchedPaths(id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, actor } = await requireSuperAdmin(req);
  if (error) return error;

  const { id } = await params;
  const deviceType = loadDeviceType(id);
  if (!deviceType) return errorResponse("NOT_FOUND", "No such device.", 404);

  const body = await req.json().catch(() => null);
  const folderType = typeof body?.folderType === "string" && FOLDER_TYPES.includes(body.folderType as FolderType) ? (body.folderType as FolderType) : null;
  const path = typeof body?.path === "string" ? body.path.trim() : "";

  if (!folderType || !path) {
    return errorResponse("INVALID_INPUT", "folderType and path are required.", 400);
  }

  const unsupported = unsupportedFolderTypesFor(deviceType, [folderType]);
  if (unsupported.length > 0) {
    return errorResponse("INVALID_STATE", `A ${deviceType} connector can't sync: ${folderType}. See File_Connector_Architecture.md.`, 400);
  }

  const created = addWatchedPath(id, folderType, path);
  await logSecurityEvent({ type: "permission_changed", userId: actor!.id, detail: { scope: "device_connector", action: "folder_added", deviceId: id, folderType, path } });

  return NextResponse.json(created, { status: 201 });
}
