process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";

vi.mock("@/lib/core/ai/frontier", () => ({
  isFrontierConfigured: vi.fn(() => true),
  escalateToFrontier: vi.fn(async () => "Here's a second opinion from the frontier model."),
}));

const { isFrontierConfigured, escalateToFrontier } = await import("@/lib/core/ai/frontier");
const { POST } = await import("./route");

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission)
     VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin', 1, 1)`
  ).run();
  // Malachi: a minor with no outside-call permissions, per AI_Permissions.md.
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission)
     VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user', 0, 0)`
  ).run();
  // Vee: holds Approve Outside Calls but not the sensitive-data gate specifically.
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission)
     VALUES ('vee', 'vee.test', 'x', 'Vee', 'admin', 1, 0)`
  ).run();
});

function seedConversation(ownerId: string) {
  const db = getDb();
  const conversationId = randomUUID();
  db.prepare(`INSERT INTO conversations (id, user_id) VALUES (?, ?)`).run(conversationId, ownerId);

  const questionId = randomUUID();
  const replyId = randomUUID();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, source) VALUES (?, ?, 'user', ?, ?, 'local')`
  ).run(questionId, conversationId, "What's a good substitute for buttermilk?", "2026-08-03T09:00:00.000Z");
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at, source, feedback) VALUES (?, ?, 'assistant', ?, ?, 'local', 'thumbs_down')`
  ).run(replyId, conversationId, "Try water.", "2026-08-03T09:00:01.000Z");

  return { conversationId, questionId, replyId };
}

function escalateReq(userId: string | null, body?: unknown) {
  return new NextRequest("http://localhost/api/assistant/conversations/x/messages/y/escalate", {
    method: "POST",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function idParams(id: string, messageId: string) {
  return { params: Promise.resolve({ id, messageId }) };
}

describe("POST /api/assistant/conversations/[id]/messages/[messageId]/escalate", () => {
  it("requires authentication", async () => {
    const { conversationId, replyId } = seedConversation("dad");
    const res = await POST(escalateReq(null), idParams(conversationId, replyId));
    expect(res.status).toBe(401);
  });

  it("returns 503 when no frontier connection is configured", async () => {
    vi.mocked(isFrontierConfigured).mockReturnValueOnce(false);
    const { conversationId, replyId } = seedConversation("dad");
    const res = await POST(escalateReq("dad"), idParams(conversationId, replyId));
    expect(res.status).toBe(503);
  });

  it("404s for a nonexistent conversation", async () => {
    const res = await POST(escalateReq("dad"), idParams(randomUUID(), randomUUID()));
    expect(res.status).toBe(404);
  });

  it("forbids escalating a conversation that belongs to someone else", async () => {
    const { conversationId, replyId } = seedConversation("dad");
    const res = await POST(escalateReq("malachi"), idParams(conversationId, replyId));
    expect(res.status).toBe(403);
  });

  it("404s for a nonexistent message within an owned conversation", async () => {
    const { conversationId } = seedConversation("dad");
    const res = await POST(escalateReq("dad"), idParams(conversationId, randomUUID()));
    expect(res.status).toBe(404);
  });

  it("rejects escalating a user-role message (not an assistant reply)", async () => {
    const { conversationId, questionId } = seedConversation("dad");
    const res = await POST(escalateReq("dad"), idParams(conversationId, questionId));
    expect(res.status).toBe(400);
  });

  it("rejects escalating a reply that's already source 'frontier'", async () => {
    const db = getDb();
    const conversationId = randomUUID();
    db.prepare(`INSERT INTO conversations (id, user_id) VALUES (?, 'dad')`).run(conversationId);
    const replyId = randomUUID();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at, source) VALUES (?, ?, 'assistant', 'x', ?, 'frontier')`
    ).run(replyId, conversationId, "2026-08-03T09:00:00.000Z");

    const res = await POST(escalateReq("dad"), idParams(conversationId, replyId));
    expect(res.status).toBe(400);
  });

  it("rejects escalating an orphaned assistant reply with no preceding user question", async () => {
    const db = getDb();
    const conversationId = randomUUID();
    db.prepare(`INSERT INTO conversations (id, user_id) VALUES (?, 'dad')`).run(conversationId);
    const replyId = randomUUID();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at, source) VALUES (?, ?, 'assistant', 'orphan reply', ?, 'local')`
    ).run(replyId, conversationId, "2026-08-03T09:00:00.000Z");

    const res = await POST(escalateReq("dad"), idParams(conversationId, replyId));
    expect(res.status).toBe(400);
  });

  it("forbids escalation for a user without the Approve Outside Calls permission", async () => {
    const { conversationId, replyId } = seedConversation("malachi");
    const res = await POST(escalateReq("malachi"), idParams(conversationId, replyId));
    expect(res.status).toBe(403);
  });

  it("forbids escalation for a user with Approve Outside Calls but not the sensitive-data gate", async () => {
    const { conversationId, replyId } = seedConversation("vee");
    const res = await POST(escalateReq("vee"), idParams(conversationId, replyId));
    expect(res.status).toBe(403);
  });

  it("returns a preview (question, local answer, memory facts) without sending, when confirm isn't true", async () => {
    const { conversationId, replyId } = seedConversation("dad");
    const res = await POST(escalateReq("dad"), idParams(conversationId, replyId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.question).toBe("What's a good substitute for buttermilk?");
    expect(body.localAnswer).toBe("Try water.");
    expect(Array.isArray(body.memoryFacts)).toBe(true);
    expect(escalateToFrontier).not.toHaveBeenCalled();
  });

  it("preview also refuses on confirm: false explicitly", async () => {
    const { conversationId, replyId } = seedConversation("dad");
    const res = await POST(escalateReq("dad", { confirm: false }), idParams(conversationId, replyId));
    expect(res.status).toBe(200);
    expect(escalateToFrontier).not.toHaveBeenCalled();
  });

  it("actually escalates and persists a new frontier-sourced message when confirm: true", async () => {
    const { conversationId, replyId } = seedConversation("dad");
    const res = await POST(escalateReq("dad", { confirm: true }), idParams(conversationId, replyId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("frontier");
    expect(body.content).toBe("Here's a second opinion from the frontier model.");
    expect(escalateToFrontier).toHaveBeenCalledWith(
      "What's a good substitute for buttermilk?",
      expect.any(String),
      "Try water."
    );

    const stored = getDb().prepare(`SELECT role, source, content FROM messages WHERE id = ?`).get(body.id);
    expect(stored).toEqual({ role: "assistant", source: "frontier", content: "Here's a second opinion from the frontier model." });
  });
});
