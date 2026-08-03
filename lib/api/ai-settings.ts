// Thin typed API client for AI Settings, AI Memory, and AI Suggestions —
// see Application_Architecture.md's "Frontend ↔ Backend Communication" section.

export class AiSettingsApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new AiSettingsApiError(body?.error?.message ?? "Request failed.");
  }
  return res.json();
}

export async function getAiEnabled(): Promise<boolean> {
  const data = await unwrap<{ aiEnabled: boolean }>(await fetch("/api/ai-settings"));
  return data.aiEnabled;
}

export async function setAiEnabled(aiEnabled: boolean): Promise<void> {
  await unwrap(
    await fetch("/api/ai-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiEnabled }),
    })
  );
}

export interface AiMemoryEntry {
  id: string;
  fact: string;
  category: "preferences" | "routines_patterns" | "relationships_context" | null;
  source: string | null;
  confidence: number;
  lastReinforcedAt: string | null;
  isSensitive: boolean;
  flagged: boolean;
}

/** Omit userId (or pass your own id) for your own memory; a Super Admin or a permitted Admin can pass another user's id. */
export async function getAiMemoryFor(userId?: string): Promise<AiMemoryEntry[]> {
  return unwrap(await fetch(userId ? `/api/ai-memory?userId=${encodeURIComponent(userId)}` : "/api/ai-memory"));
}

export async function flagAiMemoryEntry(id: string, flagged: boolean): Promise<void> {
  await unwrap(
    await fetch(`/api/ai-memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flagged }),
    })
  );
}

/** Super Admin only, per AI_Memory.md — editing any user's entry, including their own. */
export async function editAiMemoryEntry(id: string, fact: string): Promise<void> {
  await unwrap(
    await fetch(`/api/ai-memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fact }),
    })
  );
}

export interface AiSuggestionEntry {
  id: string;
  module: string | null;
  content: string;
  generatedAt: string;
  expired: boolean;
  expiredReason: string | null;
  acceptedAt: string | null;
  feedback: "thumbs_up" | "thumbs_down" | "dismissed" | "none";
  relatedEntityId: string | null;
  relatedEntityTitle: string | null;
}

export async function getMySuggestions(status: "active" | "all" = "active"): Promise<AiSuggestionEntry[]> {
  return unwrap(await fetch(`/api/ai-suggestions?status=${status}`));
}

export async function giveSuggestionFeedback(
  id: string,
  feedback: "thumbs_up" | "thumbs_down" | "dismissed"
): Promise<void> {
  await unwrap(
    await fetch(`/api/ai-suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    })
  );
}

/** AI_Suggestions.md's Accept action — records that the user was routed to act; it never finalizes the action itself. */
export interface AcceptedSuggestion {
  id: string;
  module: string | null;
  relatedEntityId: string | null;
  feedback: string;
  acceptedAt: string | null;
  suggestedValue: string | null;
}

export async function acceptSuggestion(id: string): Promise<AcceptedSuggestion> {
  return unwrap(
    await fetch(`/api/ai-suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: true }),
    })
  );
}
