import { describe, it, expect, vi, afterEach } from "vitest";
import { ollamaChatStream, type StreamEvent } from "./ollama";

// Fakes an Ollama /api/chat streaming response: one NDJSON line per chunk,
// same shape ollamaChatStream reads via res.body.getReader().
function fakeStreamResponse(ndjsonLines: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (i >= ndjsonLines.length) return { done: true, value: undefined };
            const chunk = encoder.encode(ndjsonLines[i] + "\n");
            i += 1;
            return { done: false, value: chunk };
          },
        };
      },
    },
  };
}

async function collect(gen: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ollamaChatStream", () => {
  it("streams normal content straight through, chunk by chunk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeStreamResponse([
          JSON.stringify({ message: { content: "Hello" } }),
          JSON.stringify({ message: { content: " there" } }),
        ])
      )
    );
    const events = await collect(ollamaChatStream("model", []));
    expect(events).toEqual([
      { type: "content", text: "Hello" },
      { type: "content", text: " there" },
    ]);
  });

  it("passes through a real tool_calls event unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeStreamResponse([
          JSON.stringify({ message: { tool_calls: [{ function: { name: "get_open_tasks", arguments: {} } }] } }),
        ])
      )
    );
    const events = await collect(ollamaChatStream("model", []));
    expect(events).toEqual([{ type: "tool_calls", calls: [{ function: { name: "get_open_tasks", arguments: {} } }] }]);
  });

  it("detects a tool call leaked as literal JSON content and converts it instead of streaming raw JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeStreamResponse([JSON.stringify({ message: { content: '{"name": "get_open_tasks", "arguments": {}}' } })]))
    );
    const events = await collect(ollamaChatStream("model", []));
    expect(events).toEqual([{ type: "tool_calls", calls: [{ function: { name: "get_open_tasks", arguments: {} } }] }]);
  });

  it("still detects a leaked tool call missing the arguments key entirely, defaulting to {}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeStreamResponse([JSON.stringify({ message: { content: '{"name": "get_open_tasks"}' } })]))
    );
    const events = await collect(ollamaChatStream("model", []));
    expect(events).toEqual([{ type: "tool_calls", calls: [{ function: { name: "get_open_tasks", arguments: {} } }] }]);
  });

  it("streams a normal reply that starts with a curly brace but isn't JSON, once that's clear", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeStreamResponse([JSON.stringify({ message: { content: "{ this isn't json at all, just a brace in prose" } })]))
    );
    const events = await collect(ollamaChatStream("model", []));
    expect(events).toEqual([{ type: "content", text: "{ this isn't json at all, just a brace in prose" }]);
  });

  it("gives up sniffing and flushes once buffered content passes the length threshold without resolving", async () => {
    const longNonJson = "{" + "x".repeat(600);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeStreamResponse([JSON.stringify({ message: { content: longNonJson } })])));
    const events = await collect(ollamaChatStream("model", []));
    expect(events).toEqual([{ type: "content", text: longNonJson }]);
  });

  it("flushes held-back content if the stream ends before sniffing ever resolves", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeStreamResponse([JSON.stringify({ message: { content: '{"incomplete":' } })])));
    const events = await collect(ollamaChatStream("model", []));
    expect(events).toEqual([{ type: "content", text: '{"incomplete":' }]);
  });
});
