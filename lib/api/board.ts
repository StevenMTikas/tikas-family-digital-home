// Thin typed API client for the Family Board — see
// Application_Architecture.md's "Frontend ↔ Backend Communication" section.
// Mirrors lib/api/dashboard.ts's Family Message Board functions, since
// app/api/family-board is deliberately modeled on that same shape.

export interface BoardPost {
  id: string;
  text: string;
  postedBy: string;
  postedByName: string;
  createdAt: string;
  updatedAt: string;
}

export class BoardApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new BoardApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getBoardPosts(): Promise<BoardPost[]> {
  return unwrap(await fetch("/api/family-board"));
}

export async function postBoardPost(text: string): Promise<BoardPost> {
  return unwrap(
    await fetch("/api/family-board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  );
}

export async function editBoardPost(id: string, text: string): Promise<BoardPost> {
  return unwrap(
    await fetch(`/api/family-board/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  );
}

export async function deleteBoardPost(id: string): Promise<void> {
  return unwrap(await fetch(`/api/family-board/${id}`, { method: "DELETE" }));
}
