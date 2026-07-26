// Thin typed API client for Search — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export interface SearchResultEntry {
  type: "document" | "photo" | "family_knowledge" | "password";
  id: string;
  title: string;
  subtitle: string | null;
  isSensitive: boolean;
  distance: number;
}

export class SearchApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new SearchApiError(body?.error?.message ?? "Request failed.");
  }
  return res.json();
}

export async function search(query: string): Promise<SearchResultEntry[]> {
  return unwrap(await fetch(`/api/search?q=${encodeURIComponent(query)}`));
}

/** Where tapping a result should navigate, per Search.md's "detail view in its home module." */
export function routeForResult(result: SearchResultEntry): string {
  switch (result.type) {
    case "document":
      return "/content?tab=documents";
    case "photo":
      return "/content?tab=photos";
    case "family_knowledge":
    case "password":
      return "/content?tab=knowledge";
  }
}
