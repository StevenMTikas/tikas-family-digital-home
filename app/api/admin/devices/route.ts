// Devices admin API. See docs/01_System_Architecture/Security_Architecture.md
// ("a device must be explicitly added by an admin... there is no
// self-registration") and File_Connector_Architecture.md (Setup & Pairing —
// enabling a connector generates the auth_token an admin hands to that
// device's connector script, shown here exactly once).

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
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
  };
}

function parseDesignatedFolders(body: unknown): FolderType[] {
  if (!Array.isArray(body)) return [];
  return body.filter((f): f is FolderType => FOLDER_TYPES.includes(f));
}

async function requireSuperAdmin(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return { error: errorResponse("UNAUTHENTICATED", "Login required.", 401) };
  // Adding/pairing devices is inherently Super Admin-only, like the other
  // technical admin tools (Authorization.md).
  if (actor.role !== "super_admin") {
    return { error: errorResponse("FORBIDDEN", "Only the Super Admin can manage devices.", 403) };
  }
  return { actor };
}

export async function GET(req: NextRequest) {
  const { error } = await requireSuperAdmin(req);
  if (error) return error;

  const rows = getDb()
    .prepare(
      `SELECT d.id, d.user_id, u.full_name, d.device_type, d.device_name, d.status, d.designated_folders, d.last_sync_at, d.added_at
       FROM devices d JOIN users u ON u.id = d.user_id
       ORDER BY d.added_at DESC`
    )
    .all() as DeviceRow[];

  return NextResponse.json(rows.map(toResponseShape));
}

export async function POST(req: NextRequest) {
  const { error, actor } = await requireSuperAdmin(req);
  if (error) return error;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const deviceType = body?.deviceType === "phone" || body?.deviceType === "computer" ? body.deviceType : "";
  const deviceName = typeof body?.deviceName === "string" ? body.deviceName.trim() : "";
  const designatedFolders = parseDesignatedFolders(body?.designatedFolders);

  if (!userId || !deviceType || !deviceName) {
    return errorResponse("INVALID_INPUT", "userId, deviceType, and deviceName are required.", 400);
  }

  const db = getDb();
  const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId);
  if (!user) return errorResponse("INVALID_INPUT", "No such user.", 400);

  const unsupported = unsupportedFolderTypesFor(deviceType, designatedFolders);
  if (unsupported.length > 0) {
    return errorResponse(
      "INVALID_STATE",
      `A ${deviceType} connector can't sync: ${unsupported.join(", ")}. See File_Connector_Architecture.md.`,
      400
    );
  }

  // Computers and phones both get a real connector — the phone connector is
  // a native Expo app (mobile-connector/), not the MVP's script-based model
  // File_Connector_Architecture.md originally scoped to computers only.
  const enableConnector = (deviceType === "computer" || deviceType === "phone") && designatedFolders.length > 0;
  const authToken = enableConnector ? generateAuthToken() : null;

  const id = randomUUID();
  db.prepare(
    `INSERT INTO devices (id, user_id, device_type, device_name, status, added_by, auth_token, designated_folders)
     VALUES (?, ?, ?, ?, 'trusted', ?, ?, ?)`
  ).run(id, userId, deviceType, deviceName, actor!.id, authToken, enableConnector ? JSON.stringify(designatedFolders) : null);

  await logSecurityEvent({ type: "device_added", userId: actor!.id, detail: { deviceId: id, deviceName, targetUserId: userId } });

  const row = db
    .prepare(
      `SELECT d.id, d.user_id, u.full_name, d.device_type, d.device_name, d.status, d.designated_folders, d.last_sync_at, d.added_at
       FROM devices d JOIN users u ON u.id = d.user_id WHERE d.id = ?`
    )
    .get(id) as DeviceRow;

  // authToken is only ever returned here, at creation — never again afterward.
  return NextResponse.json({ ...toResponseShape(row), authToken }, { status: 201 });
}
