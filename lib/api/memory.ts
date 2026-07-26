// Thin typed API client for Memory — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export interface MemoryItem {
  id: string;
  title: string;
  captionNotes: string | null;
  eventLink: string | null;
  visibility: "public" | "private";
  isSensitive: boolean;
  createdBy: string;
  createdAt: string;
  canEdit: boolean;
  canDelete: boolean;
  photoIds: string[];
  documentIds: string[];
}

export class MemoryApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new MemoryApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getMemories(): Promise<MemoryItem[]> {
  return unwrap(await fetch("/api/memory"));
}

export interface MemoryInput {
  title: string;
  captionNotes?: string | null;
  eventLink?: string | null;
  visibility: "public" | "private";
  isSensitive?: boolean;
  photoIds?: string[];
  documentIds?: string[];
}

export async function createMemory(input: MemoryInput): Promise<MemoryItem> {
  const res = await fetch("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return unwrap(res);
}

export async function deleteMemory(id: string): Promise<void> {
  return unwrap(await fetch(`/api/memory/${id}`, { method: "DELETE" }));
}
