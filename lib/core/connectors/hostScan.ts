// Host self-scan — the same job a real connector does (walk its designated
// folders, report a manifest, apply it via applySyncBatch), but for folders
// on the host machine itself. There's no separate connector process here:
// the Next.js app already runs on this machine with direct filesystem
// access, so this just calls applySyncBatch() in-process instead of a real
// connector POSTing to /api/connectors/sync over HTTP. See
// File_Connector_Architecture.md's "Host Self-Scan" section.

import { readdir, stat } from "fs/promises";
import path from "path";
import {
  ensureHostDevice,
  getWatchedPaths,
  recordFolderScanStatus,
  applySyncBatch,
  type FolderType,
  type SyncItem,
} from "./index";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);
const THUMBNAIL_WIDTH = 200;

/** Recursively lists files under `dir`, skipping dotfiles/dotfolders — mirrors connector/index.js's listFiles(). Returns null (not an error) if the path itself can't be read, so the caller can report it as "not found" rather than crash the whole scan. */
async function listFiles(dir: string): Promise<string[] | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const results: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFiles(fullPath);
      if (nested) results.push(...nested);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

async function buildThumbnail(filePath: string): Promise<string | undefined> {
  if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return undefined;
  try {
    const sharp = (await import("sharp")).default;
    const buffer = await sharp(filePath).resize({ width: THUMBNAIL_WIDTH }).jpeg({ quality: 60 }).toBuffer();
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Scans every folder configured for the host device and applies the result via applySyncBatch, exactly like a real connector's sync — just in-process. Also updates each watched path's last_scan_status so the Admin dashboard can show a warning icon on one that doesn't resolve. */
export async function runHostFolderScan(): Promise<void> {
  const device = ensureHostDevice();
  const watchedPaths = getWatchedPaths(device.id);
  if (watchedPaths.length === 0) return;

  const items: SyncItem[] = [];

  for (const watched of watchedPaths) {
    const files = await listFiles(watched.path);

    if (files === null) {
      recordFolderScanStatus(device.id, watched.folderType, watched.path, "not_found");
      continue;
    }
    recordFolderScanStatus(device.id, watched.folderType, watched.path, "ok");

    for (const filePath of files) {
      const stats = await stat(filePath);
      const item: SyncItem = {
        path: filePath,
        filename: path.basename(filePath),
        folderType: watched.folderType as FolderType,
        modifiedAt: stats.mtime.toISOString(),
      };
      if (watched.folderType === "camera_photos") {
        const thumbnail = await buildThumbnail(filePath);
        if (thumbnail) item.thumbnail = thumbnail;
      }
      items.push(item);
    }
  }

  const result = applySyncBatch(device, items);

  // Same event-driven Advisor trigger as a real connector's sync route
  // (app/api/connectors/sync/route.ts) — only when something actually
  // changed. Awaited, not fire-and-forget: this runs inside the one-shot
  // scheduler script (scripts/scheduler-hourly.ts), which exits as soon as
  // main() resolves — a fire-and-forget promise here would just get killed
  // mid-flight rather than actually completing, unlike the sync route's
  // context where the server process stays alive to let it finish.
  if (result.created > 0 || result.updated > 0) {
    try {
      const { runAdvisorDetectors } = await import("@/lib/core/ai/advisor");
      await runAdvisorDetectors("event");
    } catch (err) {
      console.error("[advisor] host-scan-driven check failed:", err);
    }
  }
}
