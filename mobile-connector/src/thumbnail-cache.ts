// Tracks which photos we've already sent a thumbnail for, so a sync only
// pays to decode/resize genuinely new or changed photos.
//
// Without this, every sync rebuilds a thumbnail for every photo in the
// camera roll — thousands of image decodes per run, and a sync payload
// carrying thousands of base64 thumbnails. The host keeps the thumbnail it
// already stored when an item omits the field (see applySyncBatch in
// lib/core/connectors), so omitting it for unchanged photos is safe.
//
// Deliberately a plain JSON file rather than expo-secure-store: this isn't
// secret (unlike the pairing token), and SecureStore is the wrong shape for
// a map with thousands of entries.

import { File, Paths } from "expo-file-system";

const CACHE_FILENAME = "thumbnail-cache.json";

/** assetId -> the modifiedAt we last successfully sent a thumbnail for. */
export type ThumbnailCache = Record<string, string>;

function cacheFile(): File {
  return new File(Paths.document, CACHE_FILENAME);
}

export async function loadThumbnailCache(): Promise<ThumbnailCache> {
  try {
    const file = cacheFile();
    if (!file.exists) return {};
    const parsed: unknown = JSON.parse(await file.text());
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as ThumbnailCache;
  } catch {
    // A corrupt or unreadable cache is recoverable — worst case we rebuild
    // thumbnails once. Never let it fail a sync.
    return {};
  }
}

export async function saveThumbnailCache(cache: ThumbnailCache): Promise<void> {
  try {
    const file = cacheFile();
    if (!file.exists) file.create({ intermediates: true });
    file.write(JSON.stringify(cache));
  } catch (err) {
    console.warn("[thumbnail-cache] Could not persist cache; thumbnails will be rebuilt next sync:", err);
  }
}

export async function clearThumbnailCache(): Promise<void> {
  try {
    const file = cacheFile();
    if (file.exists) file.delete();
  } catch {
    // Nothing to do — an orphaned cache is harmless.
  }
}
