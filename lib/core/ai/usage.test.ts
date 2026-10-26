// AI usage metering — every outbound frontier call leaves a row with tokens,
// latency, and outcome; a failure to meter must never fail the call itself.

process.env.DATABASE_PATH = ":memory:";
process.env.ANTHROPIC_API_KEY = "test-key";

import fs from "fs";
import path from "path";
import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";

const { mockStream, mockCreate } = vi.hoisted(() => ({ mockStream: vi.fn(), mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mockStream, create: mockCreate };
  },
}));

const { streamFrontierReply, escalateToFrontier, generateCurriculumPlan } = await import("./frontier");
const { recordAiUsage } = await import("./usage");

interface UsageRow {
  user_id: string | null;
  feature: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  status: string;
}

function rows(): UsageRow[] {
  return getDb().prepare(`SELECT * FROM ai_usage ORDER BY created_at, rowid`).all() as UsageRow[];
}

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8"));
  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`).run();
});

beforeEach(() => {
  getDb().prepare(`DELETE FROM ai_usage`).run();
  mockStream.mockReset();
  mockCreate.mockReset();
});

function fakeStream(deltas: string[], usage?: { input_tokens: number; output_tokens: number }) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const text of deltas) yield { type: "content_block_delta", delta: { type: "text_delta", text } };
    },
    finalMessage: vi.fn().mockResolvedValue({ stop_reason: "end_turn", usage }),
  };
}

describe("frontier usage metering", () => {
  it("records tokens, model, user, and latency for a streamed reply", async () => {
    mockStream.mockReturnValue(fakeStream(["Hi"], { input_tokens: 120, output_tokens: 30 }));
    for await (const _ of streamFrontierReply([{ role: "user", content: "hello" }], { userId: "dad" })) void _;

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      user_id: "dad",
      feature: "assistant_stream",
      model: "claude-opus-5",
      input_tokens: 120,
      output_tokens: 30,
      status: "ok",
    });
    expect(rows()[0]!.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it("records an escalation", async () => {
    mockCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 80, output_tokens: 12 } });
    await escalateToFrontier("q", "ctx", "local", { userId: "dad" });
    expect(rows()[0]).toMatchObject({ feature: "escalation", input_tokens: 80, output_tokens: 12, status: "ok" });
  });

  it("records a curriculum plan generation", async () => {
    mockCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "[]" }], usage: { input_tokens: 5000, output_tokens: 900 } });
    await generateCurriculumPlan({
      subjectName: "Math",
      materialText: "text",
      startDate: "2026-09-01",
      endDate: "2027-06-01",
      blackouts: [],
      minPerWeek: 2,
      maxPerWeek: 4,
      usage: { userId: "dad" },
    });
    expect(rows()[0]).toMatchObject({ feature: "curriculum_plan", input_tokens: 5000, output_tokens: 900, status: "ok" });
  });

  it("records a failed call as status 'error' with no tokens, and still throws", async () => {
    mockCreate.mockRejectedValue(new Error("API down"));
    await expect(escalateToFrontier("q", "ctx", "local", { userId: "dad" })).rejects.toThrow("API down");
    expect(rows()[0]).toMatchObject({ feature: "escalation", input_tokens: null, output_tokens: null, status: "error" });
  });

  it("records a failed stream as an error and rethrows", async () => {
    mockStream.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield* [];
        throw new Error("stream broke");
      },
      finalMessage: vi.fn(),
    });
    await expect(async () => {
      for await (const _ of streamFrontierReply([{ role: "user", content: "hi" }], { userId: "dad" })) void _;
    }).rejects.toThrow("stream broke");
    expect(rows()[0]).toMatchObject({ feature: "assistant_stream", status: "error" });
  });

  it("stores null tokens when the response carries no usage object", async () => {
    mockCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    await escalateToFrontier("q", "ctx", "local", { userId: "dad" });
    expect(rows()[0]).toMatchObject({ input_tokens: null, output_tokens: null, status: "ok" });
  });

  it("records nothing when the caller passes no usage context", async () => {
    mockCreate.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } });
    await escalateToFrontier("q", "ctx", "local");
    expect(rows()).toHaveLength(0);
  });
});

describe("recordAiUsage", () => {
  it("never throws, even when the write fails", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      recordAiUsage({ userId: "no-such-user-needed", feature: "escalation", model: "m", inputTokens: 1, outputTokens: 1, latencyMs: 1, status: "bogus" as "ok" })
    ).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
