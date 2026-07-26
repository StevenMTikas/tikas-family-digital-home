// Core connector service. See docs/01_System_Architecture/File_Connector_Architecture.md
// and Security_Architecture.md's device trust model. Connectors are not a
// logged-in family member — they authenticate with a device id + auth_token
// issued at pairing time (see the Devices admin screen), checked here rather
// than via lib/core/permissions.

import { randomUUID, randomBytes, timingSafeEqual } from "crypto";
import { getDb } from "@/db/client";
import { saveUploadedBuffer } from "@/lib/storage/files";
import { getDefaultFolderId } from "@/lib/folders/default-folder";

export type FolderType = "camera_photos" | "documents";
export const FOLDER_TYPES: FolderType[] = ["camera_photos", "documents"];

export interface ConnectorDevice {
  id: string;
  userId: string;
  deviceType: "computer" | "phone";
  designatedFolders: FolderType[];
}

interface DeviceRow {
  id: string;
  user_id: string;
  device_type: "computer" | "phone";
  status: "trusted" | "revoked";
  auth_token: string | null;
  designated_folders: string | null;
}

/** Generates a new device pairing token. Shown once to the admin at pairing time — never stored anywhere but this column. */
export function generateAuthToken(): string {
  return randomBytes(24).toString("base64url");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a connector's device id + token against the trusted device
 * record. Returns null for any of: unknown device, revoked device, a device
 * with no connector enabled (auth_token not set), or a token mismatch —
 * deliberately not distinguishing which, so a probing request learns nothing.
 */
export function authenticateConnector(deviceId: string, token: string): ConnectorDevice | null {
  if (!deviceId || !token) return null;

  const row = getDb()
    .prepare(`SELECT id, user_id, device_type, status, auth_token, designated_folders FROM devices WHERE id = ?`)
    .get(deviceId) as DeviceRow | undefined;

  if (!row || row.status !== "trusted" || !row.auth_token) return null;
  if (!timingSafeStringEqual(row.auth_token, token)) return null;

  return {
    id: row.id,
    userId: row.user_id,
    deviceType: row.device_type,
    designatedFolders: row.designated_folders ? JSON.parse(row.designated_folders) : [],
  };
}

export interface SyncItem {
  path: string; // full path on the device — the stable identity used for diffing
  filename: string;
  folderType: FolderType;
  modifiedAt: string; // ISO
  thumbnail?: string; // base64 data URI; photos only
}

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
}

const TABLE_BY_FOLDER_TYPE: Record<FolderType, "documents" | "photos"> = {
  camera_photos: "photos",
  documents: "documents",
};

interface ExistingRow {
  id: string;
  source_path: string;
  sync_status: "local" | "metadata_only" | "fetched";
  removed_from_source_at: string | null;
  source_modified_at: string | null;
}

/**
 * Applies one connector sync batch: diffs the reported items against what's
 * already on file for this device (by source_path), inserting new
 * metadata-only records, updating changed ones, and marking anything no
 * longer reported as removed_from_source (not deleted — see
 * File_Connector_Architecture.md's resolved Questions).
 */
export function applySyncBatch(device: ConnectorDevice, items: SyncItem[]): SyncResult {
  const db = getDb();
  let created = 0;
  let updated = 0;
  let removed = 0;

  const byFolderType = new Map<FolderType, SyncItem[]>();
  for (const item of items) {
    if (!device.designatedFolders.includes(item.folderType)) continue; // ignore anything outside what was actually designated
    if (!byFolderType.has(item.folderType)) byFolderType.set(item.folderType, []);
    byFolderType.get(item.folderType)!.push(item);
  }

  for (const folderType of FOLDER_TYPES) {
    const table = TABLE_BY_FOLDER_TYPE[folderType];
    const reported = byFolderType.get(folderType) ?? [];
    const reportedPaths = new Set(reported.map((i) => i.path));

    const existing = db
      .prepare(`SELECT id, source_path, sync_status, removed_from_source_at, source_modified_at FROM ${table} WHERE source_device_id = ?`)
      .all(device.id) as ExistingRow[];
    const existingByPath = new Map(existing.map((row) => [row.source_path, row]));

    for (const item of reported) {
      const existingRow = existingByPath.get(item.path);

      if (!existingRow) {
        created += 1;
        if (table === "photos") {
          db.prepare(
            `INSERT INTO photos (id, file, uploaded_by, location, tags, visibility, is_sensitive, source_device_id, source_path, source_modified_at, sync_status, thumbnail)
             VALUES (?, '', ?, NULL, NULL, 'public', 0, ?, ?, ?, 'metadata_only', ?)`
          ).run(randomUUID(), device.userId, device.id, item.path, item.modifiedAt, item.thumbnail ?? null);
        } else {
          // Documents are only visible to a viewer via folder View access
          // (see app/api/documents GET) — a synced document needs a real
          // folder_id for the same reason a manual upload does, so it lands
          // in the same default shared folder rather than being invisible.
          db.prepare(
            `INSERT INTO documents (id, file, title, folder_id, category, is_sensitive, uploaded_by, source_device_id, source_path, source_modified_at, sync_status)
             VALUES (?, '', ?, ?, NULL, 0, ?, ?, ?, ?, 'metadata_only')`
          ).run(randomUUID(), item.filename, getDefaultFolderId(db), device.userId, device.id, item.path, item.modifiedAt);
        }
        continue;
      }

      // Only a genuine change on the device (a different modifiedAt than
      // last reported) invalidates an already-fetched copy — re-reporting
      // the same unchanged file on every sync must NOT keep bouncing it back
      // to metadata_only (caught live: a 24h scheduled re-sync of an
      // untouched file was silently undoing every prior fetch).
      const genuinelyChanged = existingRow.source_modified_at !== item.modifiedAt;
      const newSyncStatus = genuinelyChanged && existingRow.sync_status === "fetched" ? "metadata_only" : existingRow.sync_status;
      if (table === "photos") {
        db.prepare(`UPDATE photos SET sync_status = ?, removed_from_source_at = NULL, source_modified_at = ?, thumbnail = ? WHERE id = ?`).run(
          newSyncStatus,
          item.modifiedAt,
          item.thumbnail ?? null,
          existingRow.id
        );
      } else {
        db.prepare(`UPDATE documents SET sync_status = ?, removed_from_source_at = NULL, source_modified_at = ?, title = ? WHERE id = ?`).run(
          newSyncStatus,
          item.modifiedAt,
          item.filename,
          existingRow.id
        );
      }
      updated += 1;
    }

    for (const row of existing) {
      if (!reportedPaths.has(row.source_path) && !row.removed_from_source_at) {
        db.prepare(`UPDATE ${table} SET removed_from_source_at = datetime('now') WHERE id = ?`).run(row.id);
        removed += 1;
      }
    }
  }

  db.prepare(`UPDATE devices SET last_sync_at = datetime('now') WHERE id = ?`).run(device.id);

  return { created, updated, removed };
}

export interface PendingFileRequest {
  contentType: "document" | "photo";
  id: string;
  sourcePath: string;
}

/** What this device's connector should upload on its next check-in — anything a family member has actually opened. */
export function getPendingFileRequests(device: ConnectorDevice): PendingFileRequest[] {
  const db = getDb();
  const docs = db
    .prepare(
      `SELECT id, source_path FROM documents WHERE source_device_id = ? AND sync_status = 'metadata_only' AND file_requested_at IS NOT NULL`
    )
    .all(device.id) as { id: string; source_path: string }[];
  const photos = db
    .prepare(
      `SELECT id, source_path FROM photos WHERE source_device_id = ? AND sync_status = 'metadata_only' AND file_requested_at IS NOT NULL`
    )
    .all(device.id) as { id: string; source_path: string }[];

  return [
    ...docs.map((d) => ({ contentType: "document" as const, id: d.id, sourcePath: d.source_path })),
    ...photos.map((p) => ({ contentType: "photo" as const, id: p.id, sourcePath: p.source_path })),
  ];
}

/** Marks a metadata-only record as requested, so the owning device's connector picks it up on its next poll. Idempotent. */
export function requestFile(contentType: "document" | "photo", id: string): void {
  const table = contentType === "photo" ? "photos" : "documents";
  getDb()
    .prepare(`UPDATE ${table} SET file_requested_at = datetime('now') WHERE id = ? AND sync_status = 'metadata_only' AND file_requested_at IS NULL`)
    .run(id);
}

/** Stores a file a connector uploaded in response to a pending request, and marks the record fetched. */
export async function receiveFetchedFile(
  device: ConnectorDevice,
  contentType: "document" | "photo",
  id: string,
  originalFilename: string,
  buffer: Buffer
): Promise<void> {
  const table = contentType === "photo" ? "photos" : "documents";
  const row = getDb().prepare(`SELECT source_device_id FROM ${table} WHERE id = ?`).get(id) as
    | { source_device_id: string | null }
    | undefined;

  // A device may only supply bytes for content that's actually attributed to it.
  if (!row || row.source_device_id !== device.id) {
    throw new Error("No such pending request for this device.");
  }

  const storedPath = await saveUploadedBuffer(contentType === "photo" ? "photos" : "documents", originalFilename, buffer);
  getDb()
    .prepare(`UPDATE ${table} SET file = ?, sync_status = 'fetched', file_requested_at = NULL WHERE id = ?`)
    .run(storedPath, id);
}
