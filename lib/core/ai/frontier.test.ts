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

import { isFrontierConfigured, streamFrontierReply, escalateToFrontier, generateCurriculumPlan } from "./frontier";

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

describe("generateCurriculumPlan", () => {
  const baseParams = {
    subjectName: "Math",
    materialText: "Chapter 1: Fractions. Chapter 2: Decimals.",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    blackouts: [] as { startDate: string; endDate: string }[],
    minPerWeek: 2,
    maxPerWeek: 4,
  };

  it("throws when not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(generateCurriculumPlan(baseParams)).rejects.toThrow(/not configured/);
  });

  it("parses a clean JSON array response", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: '[{"title":"Fractions Worksheet","dueDate":"2026-01-05","curriculumReference":"Chapter 1"}]',
        },
      ],
    });
    const result = await generateCurriculumPlan(baseParams);
    expect(result).toEqual([{ title: "Fractions Worksheet", dueDate: "2026-01-05", curriculumReference: "Chapter 1" }]);
  });

  it("extracts the JSON array even when the model wraps it in a markdown code fence", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: '```json\n[{"title":"Fractions Worksheet","dueDate":"2026-01-05","curriculumReference":"Chapter 1"}]\n```',
        },
      ],
    });
    const result = await generateCurriculumPlan(baseParams);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Fractions Worksheet");
  });

  it("drops a weekend due date rather than failing the whole batch", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { title: "Weekday one", dueDate: "2026-01-05", curriculumReference: "" }, // Monday
            { title: "Weekend one", dueDate: "2026-01-10", curriculumReference: "" }, // Saturday
          ]),
        },
      ],
    });
    const result = await generateCurriculumPlan(baseParams);
    expect(result.map((a) => a.title)).toEqual(["Weekday one"]);
  });

  it("drops a due date outside the start/end range", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { title: "In range", dueDate: "2026-01-05", curriculumReference: "" },
            { title: "Out of range", dueDate: "2026-02-01", curriculumReference: "" },
          ]),
        },
      ],
    });
    const result = await generateCurriculumPlan(baseParams);
    expect(result.map((a) => a.title)).toEqual(["In range"]);
  });

  it("drops a due date inside a blackout range", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { title: "Before break", dueDate: "2026-01-05", curriculumReference: "" },
            { title: "During break", dueDate: "2026-01-15", curriculumReference: "" }, // Thursday, but blacked out below
          ]),
        },
      ],
    });
    const result = await generateCurriculumPlan({
      ...baseParams,
      blackouts: [{ startDate: "2026-01-14", endDate: "2026-01-16" }],
    });
    expect(result.map((a) => a.title)).toEqual(["Before break"]);
  });

  it("drops an item with no title", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify([{ title: "", dueDate: "2026-01-05", curriculumReference: "" }]) }],
    });
    expect(await generateCurriculumPlan(baseParams)).toEqual([]);
  });

  it("throws on refusal", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({ stop_reason: "refusal", content: [] });
    await expect(generateCurriculumPlan(baseParams)).rejects.toThrow(/declined/);
  });

  it("throws when the model's response isn't valid JSON", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "not json at all" }] });
    await expect(generateCurriculumPlan(baseParams)).rejects.toThrow(/valid JSON/);
  });

  it("includes the subject, material, date range, blackouts, and pace in the outbound prompt", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "[]" }] });
    await generateCurriculumPlan({
      ...baseParams,
      blackouts: [{ startDate: "2026-01-14", endDate: "2026-01-16" }],
    });
    const call = mockCreate.mock.calls[0]![0];
    expect(call.system).toContain("Math");
    expect(call.system).toContain("Chapter 1: Fractions");
    expect(call.system).toContain("2026-01-01");
    expect(call.system).toContain("2026-01-31");
    expect(call.system).toContain("2026-01-14 to 2026-01-16");
    expect(call.system).toContain("2 and 4");
  });
});
