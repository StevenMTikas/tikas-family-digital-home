// The sync engine: camera-roll scan → manifest → POST /api/connectors/sync,
// plus the pending-request fetch-and-upload loop. Mirrors the desktop
// connector's runSync()/pollPendingRequests() (connector/index.js), adapted
// for the camera roll instead of a filesystem walk. See
// File_Connector_Architecture.md.
//
// Deliberately imports from "expo-media-library/legacy", not the package's
// new SDK 57 default (Query/Asset, backed by a native module called
// ExpoMediaLibraryNext) — Expo Go's prebuilt binary doesn't include that
// module yet (SDK 57 is brand new), so the default API throws "Cannot find
// native module 'ExpoMediaLibraryNext'" at runtime inside Expo Go, even
// though it type-checks and Metro-bundles fine. The legacy API is bound to
// the older, stable native module Expo Go does ship. Worth revisiting once
// this is built as a standalone/dev-client app rather than run in Expo Go.

import * as MediaLibrary from "expo-media-library/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { postSync, getPendingRequests, postFile, type SyncItem, type SyncResult } from "./api";
import { loadThumbnailCache, saveThumbnailCache } from "./thumbnail-cache";
import type { Pairing } from "./pairing";

const THUMBNAIL_WIDTH = 200;
const PAGE_SIZE = 100; // getAssetsAsync page size — keeps memory bounded on large libraries

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
  let after: string | undefined;

  for (;;) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.photo,
      first: PAGE_SIZE,
      after,
      sortBy: MediaLibrary.SortBy.modificationTime,
    });

    for (const asset of page.assets) {
      const modifiedAt = new Date(asset.modificationTime ?? asset.creationTime ?? Date.now()).toISOString();

      const alreadySent = previousCache[asset.id] === modifiedAt;
      const thumbnail = alreadySent ? undefined : await buildThumbnail(asset.uri);

      // Carry the entry forward only if a thumbnail is genuinely on file at
      // this modifiedAt — so a failed build is retried next sync rather than
      // being remembered as done.
      if (alreadySent) thumbnailCache[asset.id] = modifiedAt;
      else if (thumbnail) thumbnailCache[asset.id] = modifiedAt;

      items.push({
        path: asset.id, // stable identity for this device — opaque to the host, just used to diff
        filename: asset.filename,
        folderType: "camera_photos",
        modifiedAt,
        ...(thumbnail ? { thumbnail } : {}),
      });
      onProgress?.(items.length);
    }

    if (!page.hasNextPage) break;
    after = page.endCursor;
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
export async function pollPendingRequests(
  pairing: Pairing
): Promise<{ fulfilled: number; failed: number; lastError?: string }> {
  const pending = await getPendingRequests(pairing);
  let fulfilled = 0;
  let failed = 0;
  let lastError: string | undefined;

  for (const request of pending) {
    try {
      // sourcePath is exactly what we sent as `path` in the manifest — the
      // asset id — so resolve it back to real bytes via expo-media-library.
      const info = await MediaLibrary.getAssetInfoAsync(request.sourcePath);
      const uri = info.localUri ?? info.uri;
      await postFile(pairing, request.contentType, request.id, uri, info.filename);
      fulfilled++;
    } catch (err) {
      // A per-item failure was previously only logged via console.warn —
      // invisible in a standalone build with no attached debugger, so a
      // real, reproducible failure just looked like "0 sent" with nothing
      // to go on. Surface the actual error text back to the UI instead.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Could not fulfill file request for ${request.sourcePath}:`, err);
      lastError = message;
      failed++;
    }
  }

  return { fulfilled, failed, lastError };
}
