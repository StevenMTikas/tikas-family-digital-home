// Low-level Ollama REST client. No SDK dependency — Ollama's API is a plain
// HTTP endpoint (Technology_Stack.md just says "Ollama, running locally"),
// and Cursor_Project_Rules.md's "keep dependencies minimal" rule argues
// against pulling in a client library for what's a couple of fetch calls.

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function ollamaHost(): string {
  return process.env.OLLAMA_HOST || "http://localhost:11434";
}

/** Non-streaming chat call — used by Advisor/Guardian, which don't feed a live UI. */
export async function ollamaChat(
  model: string,
  messages: ChatMessage[],
  tools?: ToolSpec[]
): Promise<ChatMessage> {
  const res = await fetch(`${ollamaHost()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.message as ChatMessage;
}

export type StreamEvent = { type: "content"; text: string } | { type: "tool_calls"; calls: ToolCall[] };

/**
 * Streaming chat call — used by the Assistant, per AI_Architecture.md:
 * "Responses are streamed to the UI rather than returned whole." Supports
 * tools in the same call: if the model decides to call one, Ollama emits a
 * single chunk carrying `tool_calls` (not token-streamed) instead of
 * content — the caller executes the tool and starts a fresh call with the
 * result appended. When no tool is needed (the common case), content
 * streams token-by-token as normal.
 */
export async function* ollamaChatStream(
  model: string,
  messages: ChatMessage[],
  tools?: ToolSpec[]
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${ollamaHost()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama request failed: ${res.status} ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const chunk = JSON.parse(line);
      if (chunk.message?.tool_calls?.length) {
        yield { type: "tool_calls", calls: chunk.message.tool_calls as ToolCall[] };
      } else if (chunk.message?.content) {
        yield { type: "content", text: chunk.message.content as string };
      }
    }
  }
}
