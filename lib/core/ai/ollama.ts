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

  // Guards a known failure mode: instead of using the `tool_calls` field
  // Ollama provides for a real tool call, the model sometimes writes one as
  // literal JSON into `content` instead (e.g. `{"name": "get_open_tasks",
  // "arguments": {}}`) — malformed output that must never reach the user as
  // prose. Sniff the leading edge of content for this shape; once it's
  // clear a reply isn't doing this (the overwhelmingly common case), stop
  // sniffing and stream straight through with no added delay. A reply that
  // legitimately starts with `{` (e.g. a JSON example asked for) costs at
  // most SNIFF_GIVE_UP_LENGTH characters of buffering before it flushes.
  let sniffing = true;
  let sniffBuffer = "";
  const SNIFF_GIVE_UP_LENGTH = 500;

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
        continue;
      }

      const text = chunk.message?.content as string | undefined;
      if (!text) continue;

      if (!sniffing) {
        yield { type: "content", text };
        continue;
      }

      sniffBuffer += text;
      const trimmed = sniffBuffer.trimStart();
      if (!trimmed.startsWith("{")) {
        sniffing = false;
        yield { type: "content", text: sniffBuffer };
        sniffBuffer = "";
        continue;
      }

      let parsed: { name?: unknown; arguments?: unknown; parameters?: unknown } | null = null;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // Not complete/valid JSON yet — keep buffering, unless this has
        // gone on long enough that it's clearly not a short tool-call object.
        if (sniffBuffer.length > SNIFF_GIVE_UP_LENGTH) {
          sniffing = false;
          yield { type: "content", text: sniffBuffer };
          sniffBuffer = "";
        }
        continue;
      }

      sniffing = false;
      sniffBuffer = "";
      if (parsed && typeof parsed.name === "string" && parsed.name.length > 0) {
        // runTool already falls back to "Unknown tool: X" for a name that
        // doesn't match a real tool, so a rare false-positive sniff (some
        // other JSON reply that happens to have a top-level "name" string)
        // degrades to that existing fallback rather than a broken state.
        yield {
          type: "tool_calls",
          calls: [
            {
              function: {
                name: parsed.name,
                arguments: (parsed.arguments ?? parsed.parameters ?? {}) as Record<string, unknown>,
              },
            },
          ],
        };
      } else {
        yield { type: "content", text: trimmed };
      }
    }
  }

  // Stream ended while still sniffing (e.g. a short reply that never
  // resolved into complete JSON) — flush whatever was held back rather than
  // silently dropping it.
  if (sniffing && sniffBuffer) {
    yield { type: "content", text: sniffBuffer };
  }
}
