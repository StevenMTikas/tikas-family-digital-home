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

export async function getMyAiMemory(): Promise<AiMemoryEntry[]> {
  return unwrap(await fetch("/api/ai-memory"));
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
export async function acceptSuggestion(id: string): Promise<void> {
  await unwrap(
    await fetch(`/api/ai-suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accepted: true }),
    })
  );
}
