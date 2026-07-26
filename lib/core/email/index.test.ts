process.env.DATABASE_PATH = ":memory:";
process.env.EMAIL_ENCRYPTION_KEY = "test-email-key";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";

// Real network calls (IMAP, Ollama) are mocked — these tests exercise the
// service's own logic (connect/revoke persistence, summary shaping,
// classification-response parsing), not real server behavior.
const fakeMessages = [
  { uid: 1, envelope: { subject: "Electric bill due", from: [{ name: "City Power", address: "billing@citypower.example" }] } },
  { uid: 2, envelope: { subject: "50% off sale this weekend!", from: [{ address: "deals@shop.example" }] } },
];

vi.mock("imapflow", () => ({
  ImapFlow: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
    search: vi.fn().mockResolvedValue([1, 2]),
    fetch: vi.fn().mockImplementation(async function* () {
      for (const m of fakeMessages) yield m;
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  })),
}));

vi.mock("@/lib/core/ai/ollama", () => ({
  ollamaChat: vi.fn().mockResolvedValue({ role: "assistant", content: "[0]" }),
}));

const { connectEmailAccount, getAccountForUser, revokeEmailAccount, fetchEmailSummary } = await import("./index");

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);
  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
    "malachi",
    "malachi.test",
    "Malachi",
    "basic_user"
  );
});

describe("connectEmailAccount / getAccountForUser / revokeEmailAccount", () => {
  it("connects an account for a user, available even to a Basic User (own account, per Email.md)", () => {
    expect(getAccountForUser("malachi")).toBeNull();

    const account = connectEmailAccount({
      userId: "malachi",
      provider: "gmail",
      emailAddress: "malachi@example.com",
      imapHost: "imap.gmail.com",
      imapPort: 993,
      imapUsername: "malachi@example.com",
      password: "app-password",
    });

    expect(account.status).toBe("connected");
    expect(account.emailAddress).toBe("malachi@example.com");
    expect(getAccountForUser("malachi")?.id).toBe(account.id);
  });

  it("reconnecting replaces the single account rather than creating a second one", () => {
    connectEmailAccount({
      userId: "malachi",
      provider: "outlook",
      emailAddress: "new@example.com",
      imapHost: "outlook.office365.com",
      imapPort: 993,
      imapUsername: "new@example.com",
      password: "different-password",
    });

    const db = getDb();
    const count = db.prepare(`SELECT COUNT(*) c FROM email_accounts WHERE user_id = 'malachi'`).get() as { c: number };
    expect(count.c).toBe(1);
    expect(getAccountForUser("malachi")?.emailAddress).toBe("new@example.com");
  });

  it("revoke flips status rather than deleting the row", () => {
    revokeEmailAccount("malachi");
    const account = getAccountForUser("malachi");
    expect(account).not.toBeNull();
    expect(account!.status).toBe("revoked");
  });
});

describe("fetchEmailSummary", () => {
  it("throws when there's no connected account", async () => {
    await expect(fetchEmailSummary("malachi")).rejects.toThrow();
  });

  it("returns unread count and only the classified-important messages, never persisting content", async () => {
    connectEmailAccount({
      userId: "malachi",
      provider: "gmail",
      emailAddress: "malachi@example.com",
      imapHost: "imap.gmail.com",
      imapPort: 993,
      imapUsername: "malachi@example.com",
      password: "app-password",
    });

    const summary = await fetchEmailSummary("malachi");
    expect(summary.unreadCount).toBe(2);
    expect(summary.importantCount).toBe(1);
    expect(summary.importantMessages[0]!.subject).toBe("Electric bill due");
    expect(summary.importantMessages[0]!.webmailUrl).toBe("https://mail.google.com");

    // No new tables/columns store message content — only email_accounts (connection metadata) exists.
    const db = getDb();
    const hasMessagesTable = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%email_message%'`)
      .get();
    expect(hasMessagesTable).toBeUndefined();
  });
});
