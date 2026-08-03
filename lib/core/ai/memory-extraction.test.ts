process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";
import { extractMemoryForUser, runMemoryExtraction } from "./memory-extraction";

function fakeOllamaChatResponse(content: string) {
  return { ok: true, json: async () => ({ message: { role: "assistant", content } }) };
}

function seedConversationMessage(userId: string, content: string, createdAtIso: string) {
  const db = getDb();
  const conversationId = randomUUID();
  db.prepare(`INSERT INTO conversations (id, user_id, title) VALUES (?, ?, NULL)`).run(conversationId, userId);
  db.prepare(`INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`).run(
    randomUUID(),
    conversationId,
    content,
    createdAtIso
  );
}

function getMemoryRows(userId: string) {
  return getDb().prepare(`SELECT fact, category, source FROM ai_memory WHERE user_id = ?`).all(userId) as {
    fact: string;
    category: string | null;
    source: string;
  }[];
}

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);

  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role, ai_enabled) VALUES (?, ?, 'x', ?, ?, 1)`).run(
    "malachi",
    "malachi.test",
    "Malachi",
    "basic_user"
  );
  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role, ai_enabled) VALUES (?, ?, 'x', ?, ?, 0)`).run(
    "vee",
    "vee.test",
    "Vee",
    "admin"
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractMemoryForUser", () => {
  it("creates a memory fact for each item the model returns, tagged inferred_pattern", async () => {
    seedConversationMessage("malachi", "I really like it when you keep answers short.", new Date().toISOString());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeOllamaChatResponse(
          JSON.stringify([{ fact: "Malachi prefers short, concise answers.", category: "preferences" }])
        )
      )
    );

    const created = await extractMemoryForUser("malachi", new Date(Date.now() - 60000).toISOString());
    expect(created).toBe(1);

    const rows = getMemoryRows("malachi");
    expect(rows).toContainEqual({ fact: "Malachi prefers short, concise answers.", category: "preferences", source: "inferred_pattern" });
  });

  it("creates nothing and does not throw when the model returns malformed JSON", async () => {
    seedConversationMessage("malachi", "just chatting about nothing durable", new Date().toISOString());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeOllamaChatResponse("not valid json at all")));

    const created = await extractMemoryForUser("malachi", new Date(Date.now() - 60000).toISOString());
    expect(created).toBe(0);
  });

  it("creates nothing when the model deliberately returns an empty array", async () => {
    seedConversationMessage("malachi", "what's 2 plus 2", new Date().toISOString());
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeOllamaChatResponse("[]")));

    const created = await extractMemoryForUser("malachi", new Date(Date.now() - 60000).toISOString());
    expect(created).toBe(0);
  });

  it("never calls the model at all when there's no new conversation or upcoming context", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // A "since" in the future excludes every seeded message.
    const created = await extractMemoryForUser("malachi", new Date(Date.now() + 60 * 60 * 1000).toISOString());
    expect(created).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caps how many facts a single run can create", async () => {
    seedConversationMessage("malachi", "a long rambling conversation", new Date().toISOString());
    const sixFacts = Array.from({ length: 6 }, (_, i) => ({ fact: `Fact number ${i}`, category: "preferences" }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeOllamaChatResponse(JSON.stringify(sixFacts))));

    const created = await extractMemoryForUser("malachi", new Date(Date.now() - 60000).toISOString());
    expect(created).toBe(5);
  });
});

describe("runMemoryExtraction", () => {
  beforeEach(() => {
    // Clean slate per test so due-check assertions aren't affected by
    // ai_interaction rows other tests/extractMemoryForUser calls may have logged.
    getDb().prepare(`DELETE FROM security_events WHERE type = 'ai_interaction'`).run();
  });

  it("skips a user with no ai_enabled account, and one already extracted within the last 24h", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeOllamaChatResponse("[]"));
    vi.stubGlobal("fetch", fetchMock);

    getDb()
      .prepare(`INSERT INTO security_events (id, type, user_id, detail, created_at) VALUES (?, 'ai_interaction', 'malachi', ?, ?)`)
      .run(randomUUID(), JSON.stringify({ agent: "assistant", memoryExtraction: true, factsCreated: 0 }), new Date().toISOString());

    const { usersProcessed } = await runMemoryExtraction();
    // Malachi was just "extracted" (not due for 24h); Vee has ai_enabled=0
    // and is excluded from the query entirely. Neither should be processed.
    expect(usersProcessed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("processes a user who has never been extracted before", async () => {
    seedConversationMessage("malachi", "I love hiking on weekends", new Date().toISOString());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeOllamaChatResponse(JSON.stringify([{ fact: "Malachi enjoys hiking on weekends.", category: "preferences" }])))
    );

    const { usersProcessed, factsCreated } = await runMemoryExtraction();
    expect(usersProcessed).toBe(1);
    expect(factsCreated).toBe(1);
  });
});
