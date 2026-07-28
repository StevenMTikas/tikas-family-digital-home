// Connector API client — mirrors the reference desktop connector
// (connector/index.js in the main repo) field-for-field, so the host's
// authenticateConnector/applySyncBatch/getPendingFileRequests need zero
// changes to support a phone. See File_Connector_Architecture.md.

import { File, Paths, UploadType } from "expo-file-system";
import type { Pairing } from "./pairing";

export interface SyncItem {
  path: string; // stable identity — this device's MediaLibrary asset id
  filename: string;
  folderType: "camera_photos";
  modifiedAt: string; // ISO string
  thumbnail?: string; // data:image/jpeg;base64,...
}

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
}

export interface PendingRequest {
  contentType: "document" | "photo";
  id: string;
  sourcePath: string;
}

class ApiError extends Error {}

async function apiRequest(pairing: Pairing, pathname: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${pairing.hostUrl}${pathname}`, {
    ...options,
    headers: {
      "x-device-id": pairing.deviceId,
      "x-device-token": pairing.deviceToken,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(`${pathname} -> ${res.status}: ${body?.error?.message || res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function postSync(pairing: Pairing, items: SyncItem[]): Promise<SyncResult> {
  return (await apiRequest(pairing, "/api/connectors/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  })) as SyncResult;
}

export async function getPendingRequests(pairing: Pairing): Promise<PendingRequest[]> {
  return (await apiRequest(pairing, "/api/connectors/pending-requests")) as PendingRequest[];
}

/**
 * Uploads bytes for one previously-requested file. `uri` is a local file://
 * URI (e.g. from MediaLibrary).
 *
 * Deliberately NOT using fetch()+FormData with a { uri, name, type } file
 * part — the standard convention from older React Native docs — because it
 * throws "Unsupported FormDataPart implementation" on this RN version.
 * expo-file-system's File.createUploadTask() is the version-safe way to do
 * a real multipart upload from a local file.
 *
 * The upload's filename comes from the File object's own (read-only) `name`
 * property, derived from its path — a raw MediaLibrary asset URI doesn't
 * carry a usable filename (Android content:// URIs resolve to something like
 * the numeric asset id, no extension), so the source is first copied to a
 * cache file actually named `filename` before uploading that copy.
 */
export async function postFile(
  pairing: Pairing,
  contentType: "document" | "photo",
  id: string,
  uri: string,
  filename: string
): Promise<void> {
  const source = new File(uri);
  const named = new File(Paths.cache, filename);
  if (named.exists) named.delete();
  await source.copy(named);

  try {
    const task = named.createUploadTask(`${pairing.hostUrl}/api/connectors/file`, {
      httpMethod: "POST",
      uploadType: UploadType.MULTIPART,
      fieldName: "file",
      mimeType: guessMimeType(filename),
      parameters: { contentType, id },
      headers: {
        "x-device-id": pairing.deviceId,
        "x-device-token": pairing.deviceToken,
      },
    });
    const result = await task.uploadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
      throw new ApiError(`/api/connectors/file -> ${result?.status}: ${result?.body ?? "no response body"}`);
    }
  } finally {
    // Scratch copy only — never leave uploaded photos accumulating in cache.
    if (named.exists) named.delete();
  }
}

function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", webp: "image/webp" };
  return map[ext] ?? "application/octet-stream";
}
