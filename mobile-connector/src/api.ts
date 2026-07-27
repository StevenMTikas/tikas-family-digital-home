// Connector API client — mirrors the reference desktop connector
// (connector/index.js in the main repo) field-for-field, so the host's
// authenticateConnector/applySyncBatch/getPendingFileRequests need zero
// changes to support a phone. See File_Connector_Architecture.md.

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

/** Uploads bytes for one previously-requested file. `uri` is a local file:// URI (e.g. from MediaLibrary). */
export async function postFile(
  pairing: Pairing,
  contentType: "document" | "photo",
  id: string,
  uri: string,
  filename: string
): Promise<void> {
  const formData = new FormData();
  formData.append("contentType", contentType);
  formData.append("id", id);
  // React Native's fetch/FormData understands this { uri, name, type } shape
  // for a file part — see Expo's networking docs for uploading local files.
  formData.append("file", { uri, name: filename, type: guessMimeType(filename) } as unknown as Blob);

  await apiRequest(pairing, "/api/connectors/file", { method: "POST", body: formData });
}

function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", webp: "image/webp" };
  return map[ext] ?? "application/octet-stream";
}
