// Thin typed API client for Subjects — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section. Mirrors lib/api/document-categories.ts.

export interface Subject {
  id: string;
  name: string;
  homeworkCount: number;
}

export class SubjectsApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new SubjectsApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getSubjects(): Promise<Subject[]> {
  return unwrap(await fetch("/api/subjects"));
}

export async function renameSubject(id: string, name: string): Promise<Subject> {
  return unwrap(
    await fetch(`/api/subjects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
  );
}

export async function deleteSubject(id: string): Promise<void> {
  return unwrap(await fetch(`/api/subjects/${id}`, { method: "DELETE" }));
}
