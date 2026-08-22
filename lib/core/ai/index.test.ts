// Testing.md calls out "the outside-call approval flow, including the
// sensitive-data gate and its unavailability to minors" by name as a
// security-critical path needing disproportionate coverage.

process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";
import { requestOutsideCallApproval, isAiEnabledForUser, streamAssistantReply, buildAssistantMessages } from "./index";

const { mockAnthropicStream } = vi.hoisted(() => ({ mockAnthropicStream: vi.fn() }));

// A real class, not vi.fn().mockImplementation(() => ({...})) — vitest 4's
// mock transform can surface that as a plain arrow function internally,
// which JS can't `new` ("X is not a constructor"), even though the
// underlying code being tested does `new Anthropic()`. A real class is
// always a valid constructor regardless of how vitest wraps it.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { stream: mockAnthropicStream };
  },
}));

function fakeAnthropicStream(deltas: string[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const text of deltas) {
        yield { type: "content_block_delta", delta: { type: "text_delta", text } };
      }
    },
    finalMessage: vi.fn().mockResolvedValue({ stop_reason: "end_turn" }),
  };
}

function fakeOllamaStreamResponse(content: string) {
  const encoder = new TextEncoder();
  let sent = false;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: encoder.encode(JSON.stringify({ message: { content } }) + "\n") };
          },
        };
      },
    },
  };
}

async function collect(gen: AsyncGenerator<string>): Promise<string> {
  let full = "";
  for await (const chunk of gen) full += chunk;
  return full;
}

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);

  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission, ai_enabled)
     VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`
  ).run("dad", "dad.test", "Dad", "super_admin", 0, 0, 1);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission, ai_enabled)
     VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`
  ).run("vee-full", "vee-full.test", "Vee Full", "admin", 1, 1, 1);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission, ai_enabled)
     VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`
  ).run("vee-basic", "vee-basic.test", "Vee Basic", "admin", 1, 0, 1);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission, ai_enabled)
     VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`
  ).run("malachi", "malachi.test", "Malachi", "basic_user", 0, 0, 0);
});

describe("requestOutsideCallApproval", () => {
  it("Super Admin can send non-sensitive data despite the flag being off (bypass)", async () => {
    expect(await requestOutsideCallApproval({ userId: "dad", agent: "assistant" }, "a photo", false)).toBe(true);
  });

  it("denies a user without approve_outside_calls at all", async () => {
    expect(await requestOutsideCallApproval({ userId: "malachi", agent: "assistant" }, "a photo", false)).toBe(false);
  });

  it("allows non-sensitive data for a user with approve_outside_calls", async () => {
    expect(await requestOutsideCallApproval({ userId: "vee-basic", agent: "assistant" }, "a photo", false)).toBe(true);
  });

  it("denies sensitive data for a user who has approve_outside_calls but not the sensitive gate", async () => {
    expect(await requestOutsideCallApproval({ userId: "vee-basic", agent: "assistant" }, "medical record", true)).toBe(false);
  });

  it("allows sensitive data only when both gates are held", async () => {
    expect(await requestOutsideCallApproval({ userId: "vee-full", agent: "assistant" }, "medical record", true)).toBe(true);
  });

  it("Malachi's account (a minor) has no path to the sensitive gate, matching AI_Permissions.md", async () => {
    // Not just off-by-default — this account was never granted either gate at
    // seed time, mirroring "cannot be granted to a minor at all." Actually
    // preventing the grant itself is Phase 4 Administration UI work, not
    // built yet — this test only proves the check-side enforcement holds.
    expect(await requestOutsideCallApproval({ userId: "malachi", agent: "assistant" }, "medical record", true)).toBe(false);
  });
});

describe("isAiEnabledForUser", () => {
  it("is true by default for an adult account", async () => {
    expect(await isAiEnabledForUser("dad")).toBe(true);
  });

  it("reflects ai_enabled = 0", async () => {
    expect(await isAiEnabledForUser("malachi")).toBe(false);
  });
});

describe("buildAssistantMessages — identity awareness", () => {
  it("tells the model who it's currently speaking with", async () => {
    const messages = await buildAssistantMessages("dad", randomUUID());
    const systemPrompt = messages[0]!.content;
    expect(systemPrompt).toContain("You are currently speaking with Dad (role: super_admin).");
  });
});

describe("streamAssistantReply — hybrid local/frontier routing", () => {
  const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

  function seedConversation(question: string): string {
    const conversationId = randomUUID();
    const db = getDb();
    db.prepare(`INSERT INTO conversations (id, user_id, title) VALUES (?, 'dad', NULL)`).run(conversationId);
    db.prepare(`INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, 'user', ?)`).run(
      randomUUID(),
      conversationId,
      question
    );
    return conversationId;
  }

  // Explicit, strictly-increasing created_at values, all in the recent past
  // (not forward from "now") — sqlite's datetime('now') default only has
  // second resolution, so several rows inserted back-to-back in a test could
  // otherwise tie and sort unpredictably; staying in the past also keeps
  // every seeded row strictly before the real assistant reply this function
  // inserts with an actual current timestamp, so it always sorts last.
  function seedThread(turns: { role: "user" | "assistant"; content: string; source?: "local" | "frontier" }[]): string {
    const conversationId = randomUUID();
    const db = getDb();
    db.prepare(`INSERT INTO conversations (id, user_id, title) VALUES (?, 'dad', NULL)`).run(conversationId);
    turns.forEach((turn, i) => {
      db.prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, source) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        conversationId,
        turn.role,
        turn.content,
        new Date(Date.now() - (turns.length - i) * 1000).toISOString(),
        turn.source ?? "local"
      );
    });
    return conversationId;
  }

  function lastMessageRow(conversationId: string) {
    return getDb()
      .prepare(`SELECT role, content, source FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(conversationId) as { role: string; content: string; source: string };
  }

  beforeEach(() => {
    mockAnthropicStream.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it("routes a question needing family data to the local model even when frontier is configured", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(fakeOllamaStreamResponse("Your open tasks: none."));
    vi.stubGlobal("fetch", fetchMock);

    const conversationId = seedConversation("What tasks do I have open?");
    const reply = await collect(streamAssistantReply("dad", conversationId));

    expect(reply).toBe("Your open tasks: none.");
    expect(fetchMock).toHaveBeenCalled();
    expect(mockAnthropicStream).not.toHaveBeenCalled();
    expect(lastMessageRow(conversationId)).toMatchObject({ role: "assistant", source: "local" });
  });

  it("auto-routes a question needing no family data to the frontier model with no approval prompt", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockAnthropicStream.mockReturnValue(fakeAnthropicStream(["A cup of buttermilk substitute: milk + vinegar."]));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const conversationId = seedConversation("What's a good substitute for buttermilk?");
    const reply = await collect(streamAssistantReply("dad", conversationId));

    expect(reply).toBe("A cup of buttermilk substitute: milk + vinegar.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lastMessageRow(conversationId)).toMatchObject({ role: "assistant", source: "frontier" });
  });

  it("falls back to local when no frontier connection is configured, even for a no-family-data question", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn().mockResolvedValue(fakeOllamaStreamResponse("Milk plus a splash of vinegar or lemon juice."));
    vi.stubGlobal("fetch", fetchMock);

    const conversationId = seedConversation("What's a good substitute for buttermilk?");
    const reply = await collect(streamAssistantReply("dad", conversationId));

    expect(reply).toBe("Milk plus a splash of vinegar or lemon juice.");
    expect(fetchMock).toHaveBeenCalled();
    expect(mockAnthropicStream).not.toHaveBeenCalled();
    expect(lastMessageRow(conversationId)).toMatchObject({ role: "assistant", source: "local" });
  });

  it("sends the recent conversation window (not just the bare new question) to the frontier model, restoring follow-up continuity", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockAnthropicStream.mockReturnValue(fakeAnthropicStream(["Joshua 3:4 says to keep a distance from the ark."]));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const conversationId = seedThread([
      { role: "user", content: "give me the text of Joshua 3:5" },
      { role: "assistant", content: "Joshua told the priests to take up the ark, for tomorrow the LORD will do wonders.", source: "frontier" },
      { role: "user", content: "and verse 4?" },
    ]);
    const reply = await collect(streamAssistantReply("dad", conversationId));

    expect(reply).toBe("Joshua 3:4 says to keep a distance from the ark.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockAnthropicStream).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "give me the text of Joshua 3:5" },
          { role: "assistant", content: "Joshua told the priests to take up the ark, for tomorrow the LORD will do wonders." },
          { role: "user", content: "and verse 4?" },
        ],
      })
    );
    expect(lastMessageRow(conversationId)).toMatchObject({ role: "assistant", source: "frontier" });
  });

  it("does not force a local fallback just because a prior frontier-sourced reply happens to contain a schedule-ish word", async () => {
    // Regression test for a real bug found live: the windowed check used to
    // keyword-scan assistant text too, and a Bible translation's "...for
    // tomorrow the LORD will do wonders..." tripped the "tomorrow" keyword,
    // wrongly forcing an unrelated follow-up back to local.
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockAnthropicStream.mockReturnValue(fakeAnthropicStream(["A cup of buttermilk substitute: milk + vinegar."]));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const conversationId = seedThread([
      { role: "user", content: "give me the text of Joshua 3:5" },
      { role: "assistant", content: "...for tomorrow the LORD will do wonders among you.", source: "frontier" },
      { role: "user", content: "what's a good substitute for buttermilk?" },
    ]);
    const reply = await collect(streamAssistantReply("dad", conversationId));

    expect(reply).toBe("A cup of buttermilk substitute: milk + vinegar.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lastMessageRow(conversationId)).toMatchObject({ role: "assistant", source: "frontier" });
  });

  it("falls back to local when an earlier reply in the window was itself local-sourced, even if its text has no keywords", async () => {
    // The other half of the source-vs-keyword fix: a local reply can carry
    // real family data without containing any messageNeedsTools() keyword
    // at all (e.g. a name/appointment), so this must be caught by `source`,
    // not by scanning for keywords the reply text may not even contain.
    process.env.ANTHROPIC_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(fakeOllamaStreamResponse("He has a follow-up on the 14th."));
    vi.stubGlobal("fetch", fetchMock);

    const conversationId = seedThread([
      { role: "user", content: "What tasks do I have open?" },
      { role: "assistant", content: "Malachi has a dentist appointment.", source: "local" },
      { role: "user", content: "when's his next one after that?" },
    ]);
    const reply = await collect(streamAssistantReply("dad", conversationId));

    expect(reply).toBe("He has a follow-up on the 14th.");
    expect(fetchMock).toHaveBeenCalled();
    expect(mockAnthropicStream).not.toHaveBeenCalled();
    expect(lastMessageRow(conversationId)).toMatchObject({ role: "assistant", source: "local" });
  });

  it("falls back to local when an earlier turn in the recent window needed family data, even though the latest message alone looks clean", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(fakeOllamaStreamResponse("Also due this week: trash pickup reminder."));
    vi.stubGlobal("fetch", fetchMock);

    const conversationId = seedThread([
      { role: "user", content: "What tasks do I have due this week?" },
      { role: "assistant", content: "You have 2 tasks due this week." },
      { role: "user", content: "anything else?" },
    ]);
    const reply = await collect(streamAssistantReply("dad", conversationId));

    expect(reply).toBe("Also due this week: trash pickup reminder.");
    expect(fetchMock).toHaveBeenCalled();
    expect(mockAnthropicStream).not.toHaveBeenCalled();
    expect(lastMessageRow(conversationId)).toMatchObject({ role: "assistant", source: "local" });
  });
});
