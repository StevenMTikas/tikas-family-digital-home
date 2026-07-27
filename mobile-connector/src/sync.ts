// The sync engine: camera-roll scan → manifest → POST /api/connectors/sync,
// plus the pending-request fetch-and-upload loop. Mirrors the desktop
// connector's runSync()/pollPendingRequests() (connector/index.js), adapted
// for expo-media-library's SDK 57 Query API instead of a filesystem walk.
// See File_Connector_Architecture.md.

import { Query, Asset, AssetField, MediaType } from "expo-media-library";
import * as ImageManipulator from "expo-image-manipulator";
import { postSync, getPendingRequests, postFile, type SyncItem, type SyncResult } from "./api";
import { loadThumbnailCache, saveThumbnailCache } from "./thumbnail-cache";
import type { Pairing } from "./pairing";

const THUMBNAIL_WIDTH = 200;
const PAGE_SIZE = 100; // Query.limit()/offset() page size — keeps memory bounded on large libraries

async function buildThumbnail(uri: string): Promise<string | undefined> {
  try {
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: THUMBNAIL_WIDTH } }], {
      compress: 0.6,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    return result.base64 ? `data:image/jpeg;base64,${result.base64}` : undefined;
  } catch {
    // A single bad/corrupt photo shouldn't fail the whole sync — same
    // "swallow and continue" behavior as the desktop connector's sharp call.
    return undefined;
  }
}

/**
 * Reports the device's entire current camera-roll view — the host does the
 * diffing. A thumbnail is attached only for photos that are new or whose
 * modification time changed since the last successful sync; the host keeps
 * the thumbnail it already stored when the field is omitted, so re-decoding
 * the whole camera roll every run would be pure waste.
 */
export async function buildManifest(onProgress?: (scanned: number) => void): Promise<{ items: SyncItem[]; thumbnailCache: Record<string, string> }> {
  const items: SyncItem[] = [];
  const previousCache = await loadThumbnailCache();
  const thumbnailCache: Record<string, string> = {};
  let offset = 0;

  for (;;) {
    const assets = await new Query()
      .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
      .orderBy(AssetField.MODIFICATION_TIME)
      .limit(PAGE_SIZE)
      .offset(offset)
      .exe();
    if (assets.length === 0) break;

    for (const asset of assets) {
      const info = await asset.getInfo();
      const modifiedAt = new Date(info.modificationTime ?? info.creationTime ?? Date.now()).toISOString();

      const alreadySent = previousCache[info.id] === modifiedAt;
      const thumbnail = alreadySent ? undefined : await buildThumbnail(info.uri);

      // Carry the entry forward only if a thumbnail is genuinely on file at
      // this modifiedAt — so a failed build is retried next sync rather than
      // being remembered as done.
      if (alreadySent) thumbnailCache[info.id] = modifiedAt;
      else if (thumbnail) thumbnailCache[info.id] = modifiedAt;

      items.push({
        path: info.id, // stable identity for this device — opaque to the host, just used to diff
        filename: info.filename,
        folderType: "camera_photos",
        modifiedAt,
        ...(thumbnail ? { thumbnail } : {}),
      });
      onProgress?.(items.length);
    }

    offset += assets.length;
    if (assets.length < PAGE_SIZE) break;
  }

  return { items, thumbnailCache };
}

export async function runSync(pairing: Pairing, onProgress?: (scanned: number) => void): Promise<SyncResult> {
  const { items, thumbnailCache } = await buildManifest(onProgress);
  const result = await postSync(pairing, items);
  // Only remember what we sent once the host has actually accepted it — a
  // failed POST must not leave us thinking those thumbnails are on file.
  await saveThumbnailCache(thumbnailCache);
  return result;
}

/** The lighter, more frequent channel for on-demand single-file fetch — see File_Connector_Architecture.md's Sync Mechanics. */
export async function pollPendingRequests(pairing: Pairing): Promise<{ fulfilled: number; failed: number }> {
  const pending = await getPendingRequests(pairing);
  let fulfilled = 0;
  let failed = 0;

  for (const request of pending) {
    try {
      // sourcePath is exactly what we sent as `path` in the manifest — the
      // asset id — so resolve it back to real bytes via expo-media-library.
      const info = await new Asset(request.sourcePath).getInfo();
      await postFile(pairing, request.contentType, request.id, info.uri, info.filename);
      fulfilled++;
    } catch (err) {
      console.warn(`Could not fulfill file request for ${request.sourcePath}:`, err);
      failed++;
    }
  }

  return { fulfilled, failed };
}
