// Thin typed API client for Document Categories — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export interface DocumentCategory {
  id: string;
  name: string;
  documentCount: number;
}

export class DocumentCategoriesApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new DocumentCategoriesApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getDocumentCategories(): Promise<DocumentCategory[]> {
  return unwrap(await fetch("/api/document-categories"));
}

export async function renameDocumentCategory(id: string, name: string): Promise<DocumentCategory> {
  return unwrap(
    await fetch(`/api/document-categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
  );
}

export async function deleteDocumentCategory(id: string): Promise<void> {
  return unwrap(await fetch(`/api/document-categories/${id}`, { method: "DELETE" }));
}
