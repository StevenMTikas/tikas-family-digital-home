// Single-device admin actions: revoke, enable/update/disable connector sync,
// regenerate a lost pairing token. See Security_Architecture.md ("Admins can
// revoke a device at any time... A revoked device's connector immediately
// loses the ability to sync") and File_Connector_Architecture.md.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { generateAuthToken, FOLDER_TYPES, unsupportedFolderTypesFor, type FolderType } from "@/lib/core/connectors";
import { logSecurityEvent } from "@/lib/core/logging";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface DeviceRow {
  id: string;
  user_id: string;
  full_name: string;
  device_type: string;
  device_name: string;
  status: string;
  designated_folders: string | null;
  last_sync_at: string | null;
  added_at: string;
  is_host_device: number;
}

function toResponseShape(row: DeviceRow) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.full_name,
    deviceType: row.device_type,
    deviceName: row.device_name,
    status: row.status,
    connectorEnabled: !!row.designated_folders,
    designatedFolders: row.designated_folders ? JSON.parse(row.designated_folders) : [],
    lastSyncAt: row.last_sync_at,
    addedAt: row.added_at,
    isHostDevice: !!row.is_host_device,
  };
}

function loadDevice(id: string) {
  return getDb()
    .prepare(
      `SELECT d.id, d.user_id, u.full_name, d.device_type, d.device_name, d.status, d.designated_folders, d.last_sync_at, d.added_at, d.is_host_device
       FROM devices d JOIN users u ON u.id = d.user_id WHERE d.id = ?`
    )
    .get(id) as DeviceRow | undefined;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can manage devices.", 403);
  }

  const existing = loadDevice(id);
  if (!existing) return errorResponse("NOT_FOUND", "No such device.", 404);

  const body = await req.json().catch(() => null);
  const db = getDb();
  let newAuthToken: string | null = null;

  if (body?.status === "revoked") {
    db.prepare(`UPDATE devices SET status = 'revoked' WHERE id = ?`).run(id);
    await logSecurityEvent({ type: "device_revoked", userId: actor.id, detail: { deviceId: id, deviceName: existing.device_name } });
  }

  if (Array.isArray(body?.designatedFolders)) {
    const folders = (body.designatedFolders as unknown[]).filter((f): f is FolderType => FOLDER_TYPES.includes(f as FolderType));
    const unsupported = unsupportedFolderTypesFor(existing.device_type as "computer" | "phone", folders);
    if (unsupported.length > 0) {
      return errorResponse(
        "INVALID_STATE",
        `A ${existing.device_type} connector can't sync: ${unsupported.join(", ")}. See File_Connector_Architecture.md.`,
        400
      );
    }
    if (folders.length === 0) {
      db.prepare(`UPDATE devices SET designated_folders = NULL, auth_token = NULL WHERE id = ?`).run(id);
    } else {
      const hadConnector = !!existing.designated_folders;
      newAuthToken = hadConnector ? null : generateAuthToken(); // keep the existing token if just changing folders
      db.prepare(`UPDATE devices SET designated_folders = ? ${hadConnector ? "" : ", auth_token = ?"} WHERE id = ?`).run(
        ...(hadConnector ? [JSON.stringify(folders), id] : [JSON.stringify(folders), newAuthToken, id])
      );
    }
    await logSecurityEvent({ type: "permission_changed", userId: actor.id, detail: { scope: "device_connector", deviceId: id, designatedFolders: folders } });
  }

  if (body?.regenerateToken === true) {
    if (!existing.designated_folders) {
      return errorResponse("INVALID_STATE", "Enable the connector (set designatedFolders) before generating a token.", 400);
    }
    newAuthToken = generateAuthToken();
    db.prepare(`UPDATE devices SET auth_token = ? WHERE id = ?`).run(newAuthToken, id);
    await logSecurityEvent({ type: "permission_changed", userId: actor.id, detail: { scope: "device_connector", action: "token_regenerated", deviceId: id } });
  }

  const updated = loadDevice(id)!;
  return NextResponse.json(newAuthToken ? { ...toResponseShape(updated), authToken: newAuthToken } : toResponseShape(updated));
}
