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

/**
 * Which folder types each kind of connector can actually sync.
 *
 * The Android phone connector (mobile-connector/) reads the camera roll only
 * — documents would need Android's Storage Access Framework, which isn't
 * built (see File_Connector_Architecture.md). Designating `documents` on a
 * phone would leave the admin screen claiming a sync that can never happen,
 * so it's rejected rather than silently accepted.
 */
export const SUPPORTED_FOLDER_TYPES: Record<"computer" | "phone", FolderType[]> = {
  computer: ["camera_photos", "documents"],
  phone: ["camera_photos"],
};

export function unsupportedFolderTypesFor(deviceType: "computer" | "phone", folders: FolderType[]): FolderType[] {
  const supported = SUPPORTED_FOLDER_TYPES[deviceType] ?? [];
  return folders.filter((f) => !supported.includes(f));
}

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

/**
 * Same as authenticateConnector, but for trusted in-process callers that
 * already know the device id and don't have (or need) a token — the host
 * self-scan (lib/core/connectors/hostScan.ts) is the only caller. Never use
 * this for anything reachable from an HTTP request.
 */
export function loadConnectorDevice(deviceId: string): ConnectorDevice | null {
  const row = getDb()
    .prepare(`SELECT id, user_id, device_type, status, auth_token, designated_folders FROM devices WHERE id = ?`)
    .get(deviceId) as DeviceRow | undefined;
  if (!row || row.status !== "trusted") return null;
  return {
    id: row.id,
    userId: row.user_id,
    deviceType: row.device_type,
    designatedFolders: row.designated_folders ? JSON.parse(row.designated_folders) : [],
  };
}

/**
 * Finds the single host device row (is_host_device = 1), creating it if this
 * is the first time — owned by the Super Admin, a normal device_type
 * 'computer' row like any other except it's never paired by a real remote
 * connector (no auth_token needed; lib/core/connectors/hostScan.ts calls
 * applySyncBatch directly, in-process). See
 * File_Connector_Architecture.md's "Host Self-Scan" section.
 */
export function ensureHostDevice(): ConnectorDevice {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM devices WHERE is_host_device = 1 LIMIT 1`).get() as
    | { id: string }
    | undefined;
  if (existing) return loadConnectorDevice(existing.id)!;

  const superAdmin = db.prepare(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`).get() as
    | { id: string }
    | undefined;
  if (!superAdmin) throw new Error("Cannot create the host device before a Super Admin account exists.");

  const id = randomUUID();
  db.prepare(
    `INSERT INTO devices (id, user_id, device_type, device_name, added_by, designated_folders, is_host_device)
     VALUES (?, ?, 'computer', 'This Computer (Host)', ?, NULL, 1)`
  ).run(id, superAdmin.id, superAdmin.id);

  return loadConnectorDevice(id)!;
}

export interface WatchedPath {
  id: string;
  folderType: FolderType;
  path: string;
  addedAt: string;
  lastScanStatus: "ok" | "not_found" | null;
  lastScanAt: string | null;
}

interface WatchedPathRow {
  id: string;
  folder_type: FolderType;
  path: string;
  added_at: string;
  last_scan_status: "ok" | "not_found" | null;
  last_scan_at: string | null;
}

function toWatchedPath(row: WatchedPathRow): WatchedPath {
  return {
    id: row.id,
    folderType: row.folder_type,
    path: row.path,
    addedAt: row.added_at,
    lastScanStatus: row.last_scan_status,
    lastScanAt: row.last_scan_at,
  };
}

/** All folder paths configured for a device, grouped by nothing in particular — callers group by folderType themselves. */
export function getWatchedPaths(deviceId: string): WatchedPath[] {
  return (
    getDb()
      .prepare(`SELECT * FROM device_watched_paths WHERE device_id = ? ORDER BY added_at`)
      .all(deviceId) as WatchedPathRow[]
  ).map(toWatchedPath);
}

/**
 * Adds a watched path for a device, from the Admin dashboard. Also
 * auto-enables that folder type on the device (adding a path obviously
 * means wanting that type synced) and mints an auth_token if this is the
 * first folder ever configured for the device — mirroring
 * app/api/admin/devices/[id]/route.ts's existing designatedFolders PATCH
 * behavior, since this is really the same "enable a connector" action, just
 * entered as a path instead of a checkbox.
 */
export function addWatchedPath(deviceId: string, folderType: FolderType, path: string): WatchedPath {
  const db = getDb();
  const device = db
    .prepare(`SELECT device_type, designated_folders, auth_token FROM devices WHERE id = ?`)
    .get(deviceId) as { device_type: "computer" | "phone"; designated_folders: string | null; auth_token: string | null } | undefined;
  if (!device) throw new Error("No such device.");

  const current: FolderType[] = device.designated_folders ? JSON.parse(device.designated_folders) : [];
  if (!current.includes(folderType)) {
    const next = [...current, folderType];
    const insert = db.transaction(() => {
      db.prepare(`UPDATE devices SET designated_folders = ? WHERE id = ?`).run(JSON.stringify(next), deviceId);
      if (!device.auth_token) {
        db.prepare(`UPDATE devices SET auth_token = ? WHERE id = ?`).run(generateAuthToken(), deviceId);
      }
    });
    insert();
  }

  const id = randomUUID();
  db.prepare(`INSERT INTO device_watched_paths (id, device_id, folder_type, path) VALUES (?, ?, ?, ?)`).run(
    id,
    deviceId,
    folderType,
    path
  );

  return toWatchedPath(
    db.prepare(`SELECT * FROM device_watched_paths WHERE id = ?`).get(id) as WatchedPathRow
  );
}

/** Removes one watched path. Deliberately does NOT auto-disable the folder type even if this was the last path of that type — leaving it enabled with zero paths is a harmless, valid state, and the type checkbox already lets someone turn it off explicitly if they mean to. */
export function removeWatchedPath(deviceId: string, pathId: string): void {
  getDb().prepare(`DELETE FROM device_watched_paths WHERE id = ? AND device_id = ?`).run(pathId, deviceId);
}

/** Records whether a specific watched path actually resolved on the connector's (or host self-scan's) last attempt — the only way the host can know, since it can't see the remote filesystem itself. Matched by device_id + folder_type + path since a connector reports these by value, not by device_watched_paths.id. */
export function recordFolderScanStatus(
  deviceId: string,
  folderType: FolderType,
  path: string,
  status: "ok" | "not_found"
): void {
  getDb()
    .prepare(
      `UPDATE device_watched_paths SET last_scan_status = ?, last_scan_at = datetime('now') WHERE device_id = ? AND folder_type = ? AND path = ?`
    )
    .run(status, deviceId, folderType, path);
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
 * Marks a source path as permanently excluded for this device — "don't sync
 * this again" for a connector-synced item a family member deleted (e.g. a
 * receipt photo) that's still present on the source device. Without this,
 * the connector reports its *entire current view* on every sync (it has no
 * idea a family member deleted anything host-side), so the item would just
 * silently reappear as metadata_only on the next sync. Idempotent.
 */
export function excludeSourcePath(deviceId: string, sourcePath: string): void {
  getDb()
    .prepare(`INSERT OR IGNORE INTO connector_exclusions (device_id, source_path) VALUES (?, ?)`)
    .run(deviceId, sourcePath);
}

/**
 * Applies one connector sync batch: diffs the reported items against what's
 * already on file for this device (by source_path), inserting new
 * metadata-only records, updating changed ones, and marking anything no
 * longer reported as removed_from_source (not deleted — see
 * File_Connector_Architecture.md's resolved Questions). Anything excluded
 * via excludeSourcePath() is dropped before any of that — treated exactly
 * as if the connector never reported it.
 */
export function applySyncBatch(device: ConnectorDevice, items: SyncItem[]): SyncResult {
  const db = getDb();
  let created = 0;
  let updated = 0;
  let removed = 0;

  const excludedPaths = new Set(
    (
      db.prepare(`SELECT source_path FROM connector_exclusions WHERE device_id = ?`).all(device.id) as {
        source_path: string;
      }[]
    ).map((r) => r.source_path)
  );

  const byFolderType = new Map<FolderType, Map<string, SyncItem>>();
  for (const item of items) {
    if (!device.designatedFolders.includes(item.folderType)) continue; // ignore anything outside what was actually designated
    if (excludedPaths.has(item.path)) continue; // "don't sync this again" — treat as never reported
    if (!byFolderType.has(item.folderType)) byFolderType.set(item.folderType, new Map());
    // Keyed by path so a batch that reports the same path twice can't create
    // two content rows for one file — last one reported wins.
    byFolderType.get(item.folderType)!.set(item.path, item);
  }

  // Only folder types this device is *currently* designated for. Walking all
  // FOLDER_TYPES would treat a de-designated folder's previously-synced files
  // as "removed from the device" on the next sync, which is a different (and
  // false) claim — they're simply no longer being watched.
  for (const folderType of FOLDER_TYPES.filter((f) => device.designatedFolders.includes(f))) {
    const table = TABLE_BY_FOLDER_TYPE[folderType];
    const reported = [...(byFolderType.get(folderType)?.values() ?? [])];
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
      const wasMarkedRemoved = existingRow.removed_from_source_at !== null;

      // An unchanged, still-present file that sent no new thumbnail needs no
      // write at all. On a phone camera roll that's thousands of no-op
      // UPDATEs per sync, every sync.
      if (!genuinelyChanged && !wasMarkedRemoved && item.thumbnail === undefined) continue;

      const newSyncStatus = genuinelyChanged && existingRow.sync_status === "fetched" ? "metadata_only" : existingRow.sync_status;
      if (table === "photos") {
        // Only overwrite the stored thumbnail when the connector actually
        // sent one. A connector that couldn't build a thumbnail this run
        // (a transient decode failure) or deliberately skipped rebuilding it
        // for an unchanged photo must not wipe a good stored thumbnail.
        if (item.thumbnail === undefined) {
          db.prepare(`UPDATE photos SET sync_status = ?, removed_from_source_at = NULL, source_modified_at = ? WHERE id = ?`).run(
            newSyncStatus,
            item.modifiedAt,
            existingRow.id
          );
        } else {
          db.prepare(`UPDATE photos SET sync_status = ?, removed_from_source_at = NULL, source_modified_at = ?, thumbnail = ? WHERE id = ?`).run(
            newSyncStatus,
            item.modifiedAt,
            item.thumbnail,
            existingRow.id
          );
        }
      } else {
        db.prepare(`UPDATE documents SET sync_status = ?, removed_from_source_at = NULL, source_modified_at = ?, title = ? WHERE id = ?`).run(
          newSyncStatus,
          item.modifiedAt,
          item.filename,
          existingRow.id
        );
      }

      // "Updated" means something actually changed — not just "was reported
      // again", which would otherwise report every file on every sync.
      if (genuinelyChanged || wasMarkedRemoved) updated += 1;
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
