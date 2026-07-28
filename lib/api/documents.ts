// Thin typed API client for Documents — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export interface DocumentItem {
  id: string;
  title: string;
  folderId: string | null;
  category: string | null;
  isSensitive: boolean;
  uploadedBy: string;
  uploadedAt: string;
  canDelete: boolean;
  syncStatus: "local" | "metadata_only" | "fetched";
  fileRequestedAt: string | null;
  removedFromSourceAt: string | null;
  sourceDeviceId: string | null;
}

export class DocumentsApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new DocumentsApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getDocuments(): Promise<DocumentItem[]> {
  return unwrap(await fetch("/api/documents"));
}

export async function uploadDocument(input: {
  file: File;
  title: string;
  category?: string;
  isSensitive: boolean;
}): Promise<DocumentItem> {
  const formData = new FormData();
  formData.set("file", input.file);
  formData.set("title", input.title);
  if (input.category) formData.set("category", input.category);
  formData.set("isSensitive", String(input.isSensitive));

  const res = await fetch("/api/documents", { method: "POST", body: formData });
  return unwrap(res);
}

export async function setDocumentSensitivity(id: string, isSensitive: boolean): Promise<void> {
  const res = await fetch(`/api/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isSensitive }),
  });
  await unwrap(res);
}

export async function deleteDocument(id: string): Promise<void> {
  return unwrap(await fetch(`/api/documents/${id}`, { method: "DELETE" }));
}

/** Deletes a connector-synced document AND remembers not to re-sync it, even though the source device still has it. */
export async function excludeDocument(id: string): Promise<void> {
  return unwrap(await fetch(`/api/documents/${id}/exclude`, { method: "POST" }));
}

export function documentDownloadUrl(id: string): string {
  return `/api/documents/${id}/download`;
}

/** Asks a connector-sourced document's source device to upload the file — see File_Connector_Architecture.md. */
export async function requestDocumentFile(id: string): Promise<void> {
  await unwrap(await fetch(`/api/documents/${id}/request-file`, { method: "POST" }));
}
