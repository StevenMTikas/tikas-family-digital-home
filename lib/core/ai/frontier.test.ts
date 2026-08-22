import { describe, it, expect, vi, afterEach } from "vitest";

const { mockStream, mockCreate } = vi.hoisted(() => ({
  mockStream: vi.fn(),
  mockCreate: vi.fn(),
}));

// A real class, not vi.fn().mockImplementation(() => ({...})) — vitest 4's
// mock transform can surface that as a plain arrow function internally,
// which JS can't `new` ("X is not a constructor"), even though the
// underlying code being tested does `new Anthropic()`. A real class is
// always a valid constructor regardless of how vitest wraps it.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mockStream, create: mockCreate };
  },
}));

import { isFrontierConfigured, streamFrontierReply, escalateToFrontier } from "./frontier";

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const c of gen) chunks.push(c);
  return chunks;
}

function fakeAnthropicStream(deltas: string[], stopReason = "end_turn") {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const text of deltas) {
        yield { type: "content_block_delta", delta: { type: "text_delta", text } };
      }
    },
    finalMessage: vi.fn().mockResolvedValue({ stop_reason: stopReason }),
  };
}

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  mockStream.mockReset();
  mockCreate.mockReset();
});

describe("isFrontierConfigured", () => {
  it("is false when ANTHROPIC_API_KEY is unset", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isFrontierConfigured()).toBe(false);
  });

  it("is true when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(isFrontierConfigured()).toBe(true);
  });
});

describe("streamFrontierReply", () => {
  it("throws when not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(collect(streamFrontierReply([{ role: "user", content: "hi" }]))).rejects.toThrow(/not configured/);
  });

  it("streams text deltas straight through", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockStream.mockReturnValue(fakeAnthropicStream(["Hello", " there"]));
    expect(await collect(streamFrontierReply([{ role: "user", content: "hi" }]))).toEqual(["Hello", " there"]);
  });

  it("sends exactly the recent-turn window it's given, no memory or anything beyond it", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockStream.mockReturnValue(fakeAnthropicStream(["ok"]));
    const turns = [
      { role: "user" as const, content: "give me the text of Joshua 3:5" },
      { role: "assistant" as const, content: "Joshua told the priests..." },
      { role: "user" as const, content: "what's a substitute for buttermilk?" },
    ];
    await collect(streamFrontierReply(turns));
    expect(mockStream).toHaveBeenCalledWith(expect.objectContaining({ messages: turns }));
  });

  it("yields a fallback message on refusal with no streamed content", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockStream.mockReturnValue(fakeAnthropicStream([], "refusal"));
    const chunks = await collect(streamFrontierReply([{ role: "user", content: "hi" }]));
    expect(chunks).toEqual(["I'm not able to help with that particular question — could you try asking it a different way?"]);
  });
});

describe("escalateToFrontier", () => {
  it("throws when not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(escalateToFrontier("q", "mem", "local answer")).rejects.toThrow(/not configured/);
  });

  it("returns the text block from a successful response", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "Better answer." }] });
    expect(await escalateToFrontier("q", "mem", "local answer")).toBe("Better answer.");
  });

  it("includes the local model's memory context and prior answer in the outbound prompt", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    await escalateToFrontier("q", "Malachi has soccer Tuesdays", "The local model's prior answer");
    const call = mockCreate.mock.calls[0]![0];
    expect(call.system).toContain("Malachi has soccer Tuesdays");
    expect(call.system).toContain("The local model's prior answer");
    expect(call.messages).toEqual([{ role: "user", content: "q" }]);
  });

  it("returns a decline message on refusal", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({ stop_reason: "refusal", content: [] });
    expect(await escalateToFrontier("q", "mem", "local answer")).toBe("The outside model declined to answer this question.");
  });
});
