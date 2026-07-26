// Thin typed API client for Family Knowledge (general items + Password
// Entries) — see Application_Architecture.md's "Frontend ↔ Backend
// Communication" section.

export interface FamilyKnowledgeItem {
  id: string;
  category: string | null;
  title: string;
  content: string | null;
  isSensitive: boolean;
  folderId: string | null;
  createdBy: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface PasswordEntrySummary {
  id: string;
  serviceName: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

export interface PasswordEntryRevealed {
  id: string;
  serviceName: string;
  username: string | null;
  password: string;
  url: string | null;
  notes: string | null;
}

export class FamilyKnowledgeApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new FamilyKnowledgeApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getFamilyKnowledgeItems(): Promise<FamilyKnowledgeItem[]> {
  return unwrap(await fetch("/api/family-knowledge"));
}

export async function createFamilyKnowledgeItem(input: {
  title: string;
  category?: string | null;
  content?: string | null;
  isSensitive?: boolean;
}): Promise<FamilyKnowledgeItem> {
  const res = await fetch("/api/family-knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return unwrap(res);
}

export async function deleteFamilyKnowledgeItem(id: string): Promise<void> {
  return unwrap(await fetch(`/api/family-knowledge/${id}`, { method: "DELETE" }));
}

export async function getPasswordEntries(): Promise<PasswordEntrySummary[]> {
  return unwrap(await fetch("/api/family-knowledge/passwords"));
}

export async function revealPasswordEntry(id: string): Promise<PasswordEntryRevealed> {
  return unwrap(await fetch(`/api/family-knowledge/passwords/${id}`));
}

export async function createPasswordEntry(input: {
  serviceName: string;
  username?: string;
  password: string;
  url?: string;
  notes?: string;
}): Promise<PasswordEntrySummary> {
  const res = await fetch("/api/family-knowledge/passwords", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return unwrap(res);
}

export async function deletePasswordEntry(id: string): Promise<void> {
  return unwrap(await fetch(`/api/family-knowledge/passwords/${id}`, { method: "DELETE" }));
}
