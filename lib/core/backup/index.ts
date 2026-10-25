// Backup service — daily full-system backup (SQLite DB + uploaded files),
// local storage, 7-day rolling retention, encrypted where practical. See
// docs/06_Admin/Backup.md.
//
// Scope decisions (Backup.md doesn't fully spell these out):
// - The DB snapshot is encrypted (it holds all metadata, Password Entries,
//   and Family Knowledge content). Uploaded files (Documents/Photos) are
//   copied as-is, matching how lib/storage/files.ts already stores them
//   unencrypted at rest — Backup doesn't invent stronger protection for
//   files than the app already gives them day-to-day.
// - No new DB table: Backup.md explicitly says backup status isn't a new
//   family-data entity. Each backup gets its own directory with a
//   `meta.json` sidecar (status/size/timestamp) instead.
// - Destination defaults to a local `backups/` directory (BACKUP_DIR env
//   var). Backup.md flags "should this be a separate physical location" as
//   an open question — making the destination configurable is the practical
//   answer for MVP: point BACKUP_DIR at a mounted external/network drive in
//   a real deployment for actual protection against local disk failure.

import { mkdir, readdir, rm, cp, readFile, writeFile, stat, rename } from "fs/promises";
import path from "path";
import { getDb, getDbPath, closeDb } from "@/db/client";
import { encryptBuffer, decryptBuffer } from "@/lib/crypto/secret-box";
import { logSecurityEvent } from "@/lib/core/logging";

// Read lazily, not as module-level consts — matching db/client.ts's getDb():
// ESM import hoisting can evaluate this module before a test file's own
// process.env assignment runs, silently locking in the wrong path.
function getBackupRoot(): string {
  return process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
}
function getUploadsRoot(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
}
export const RETENTION_COUNT = 7; // Backup.md's stated MVP default

export interface BackupMeta {
  id: string;
  createdAt: string;
  status: "success" | "failed";
  sizeBytes: number;
  error?: string;
}

function backupDir(id: string): string {
  return path.join(getBackupRoot(), id);
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(full) : (await stat(full)).size;
  }
  return total;
}

async function pruneOldBackups(): Promise<void> {
  const all = await listBackups();
  for (const meta of all.slice(RETENTION_COUNT)) {
    await rm(backupDir(meta.id), { recursive: true, force: true });
  }
}

/**
 * Runs one full backup pass. Failures are recorded in the backup's own
 * meta.json (and a backup_failed security event) rather than thrown, so a
 * scheduled run can log and move on. `triggeredBy` is the Super Admin's user
 * id for a manual run, or "" for the scheduled/system-triggered run — same
 * convention as logAiInteraction's system-triggered calls.
 */
export async function runBackup(triggeredBy: string = ""): Promise<BackupMeta> {
  const id = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = backupDir(id);

  try {
    await mkdir(dir, { recursive: true });
    const tmpDbPath = path.join(dir, "db.sqlite.tmp");
    await getDb().backup(tmpDbPath); // SQLite's online backup API — safe against concurrent writers
    const rawDb = await readFile(tmpDbPath);
    await writeFile(path.join(dir, "db.enc"), encryptBuffer(rawDb, "backup"));
    await rm(tmpDbPath);

    await cp(getUploadsRoot(), path.join(dir, "uploads"), { recursive: true }).catch(() => {
      // No uploads/ directory yet (nothing uploaded) — not an error.
    });

    const meta: BackupMeta = {
      id,
      createdAt: new Date().toISOString(),
      status: "success",
      sizeBytes: await dirSize(dir),
    };
    await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    await pruneOldBackups();
    return meta;
  } catch (err) {
    const meta: BackupMeta = {
      id,
      createdAt: new Date().toISOString(),
      status: "failed",
      sizeBytes: 0,
      error: err instanceof Error ? err.message : String(err),
    };
    console.error("[backup] runBackup failed:", err);
    await logSecurityEvent({
      type: "backup_failed",
      userId: triggeredBy,
      detail: { backupId: id, error: meta.error },
    }).catch((logErr) => console.error("[backup] failed to record backup_failed security event:", logErr));
    await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2)).catch((writeErr) =>
      console.error("[backup] failed to write failure meta.json:", writeErr)
    );
    return meta;
  }
}

/** Lists known backups, most recent first. */
export async function listBackups(): Promise<BackupMeta[]> {
  let entries;
  try {
    entries = await readdir(getBackupRoot(), { withFileTypes: true });
  } catch {
    return [];
  }

  const metas: BackupMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await readFile(path.join(getBackupRoot(), entry.name, "meta.json"), "utf8");
      metas.push(JSON.parse(raw));
    } catch {
      // No meta.json (backup crashed before it could write one) — skip it.
    }
  }
  return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLastBackup(): Promise<BackupMeta | null> {
  const all = await listBackups();
  return all[0] ?? null;
}

/**
 * Restores the DB and uploaded files from a prior successful backup.
 * Super-Admin-only and confirmation-gated at the route layer (Backup.md) —
 * this function assumes that check already happened. As a safety net against
 * this itself going wrong mid-restore, the current live DB/uploads are moved
 * aside (not deleted) under backups/pre-restore-<timestamp>/ first.
 */
export async function restoreBackup(id: string): Promise<void> {
  const dir = backupDir(id);
  const encPath = path.join(dir, "db.enc");
  const raw = await readFile(encPath).catch(() => {
    throw new Error(`Backup "${id}" not found or has no db.enc.`);
  });

  const decryptedDb = decryptBuffer(raw as Buffer, "backup");

  const preRestoreDir = backupDir(`pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await mkdir(preRestoreDir, { recursive: true });

  closeDb();

  const dbPath = getDbPath();
  await cp(dbPath, path.join(preRestoreDir, "db.sqlite")).catch(() => {
    // No existing DB file (fresh install) — nothing to preserve.
  });
  await writeFile(dbPath, decryptedDb);

  const backupUploadsDir = path.join(dir, "uploads");
  const hasBackupUploads = await stat(backupUploadsDir)
    .then((s) => s.isDirectory())
    .catch(() => false);

  if (hasBackupUploads) {
    await rename(getUploadsRoot(), path.join(preRestoreDir, "uploads")).catch(() => {
      // No existing uploads/ directory — nothing to preserve.
    });
    await cp(backupUploadsDir, getUploadsRoot(), { recursive: true });
  }
}
