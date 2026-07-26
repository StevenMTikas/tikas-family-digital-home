// Thin typed API client for Photos — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export interface PhotoItem {
  id: string;
  uploadedBy: string;
  uploadedAt: string;
  location: string | null;
  tags: string[];
  visibility: "public" | "private";
  isSensitive: boolean;
  eventLink: string | null;
  canEditVisibility: boolean;
  canDelete: boolean;
  syncStatus: "local" | "metadata_only" | "fetched";
  fileRequestedAt: string | null;
  removedFromSourceAt: string | null;
  thumbnail: string | null;
}

export class PhotosApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new PhotosApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getPhotos(): Promise<PhotoItem[]> {
  return unwrap(await fetch("/api/photos"));
}

export async function uploadPhoto(input: {
  file: File;
  location?: string;
  tags?: string;
  visibility: "public" | "private";
  isSensitive: boolean;
}): Promise<PhotoItem> {
  const formData = new FormData();
  formData.set("file", input.file);
  if (input.location) formData.set("location", input.location);
  if (input.tags) formData.set("tags", input.tags);
  formData.set("visibility", input.visibility);
  formData.set("isSensitive", String(input.isSensitive));

  const res = await fetch("/api/photos", { method: "POST", body: formData });
  return unwrap(res);
}

export async function setPhotoVisibility(id: string, visibility: "public" | "private"): Promise<void> {
  const res = await fetch(`/api/photos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibility }),
  });
  await unwrap(res);
}

export async function deletePhoto(id: string): Promise<void> {
  return unwrap(await fetch(`/api/photos/${id}`, { method: "DELETE" }));
}

export function photoFileUrl(id: string): string {
  return `/api/photos/${id}/file`;
}

/** Asks a connector-sourced photo's source device to upload the file — see File_Connector_Architecture.md. */
export async function requestPhotoFile(id: string): Promise<void> {
  await unwrap(await fetch(`/api/photos/${id}/request-file`, { method: "POST" }));
}
