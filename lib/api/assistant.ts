// Thin typed API client for the Assistant — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ConversationDetail {
  id: string;
  title: string | null;
  messages: ConversationMessage[];
}

export class AssistantApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new AssistantApiError(body?.error?.message ?? "Request failed.");
  }
  return res.json();
}

export async function getConversations(): Promise<ConversationSummary[]> {
  return unwrap(await fetch("/api/assistant/conversations"));
}

export async function createConversation(): Promise<ConversationSummary> {
  const res = await fetch("/api/assistant/conversations", { method: "POST" });
  return unwrap(res);
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  return unwrap(await fetch(`/api/assistant/conversations/${id}`));
}

/** Sends a message and streams the reply, invoking onChunk as text arrives. */
export async function sendMessageStreaming(
  conversationId: string,
  content: string,
  onChunk: (text: string) => void
): Promise<void> {
  const res = await fetch(`/api/assistant/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new AssistantApiError(body?.error?.message ?? "Request failed.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
