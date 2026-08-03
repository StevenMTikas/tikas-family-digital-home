process.env.DATABASE_PATH = ":memory:";
process.env.EMAIL_ENCRYPTION_KEY = "test-email-key";

import fs from "fs";
import path from "path";
import { beforeAll, afterEach, describe, it, expect, vi } from "vitest";
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

const { mockGenerateAuthUrl, mockGetToken, mockSetCredentials, mockGetProfile, mockMessagesList, mockMessagesGet } = vi.hoisted(() => ({
  mockGenerateAuthUrl: vi.fn().mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?fake=1"),
  mockGetToken: vi.fn(),
  mockSetCredentials: vi.fn(),
  mockGetProfile: vi.fn(),
  mockMessagesList: vi.fn(),
  mockMessagesGet: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
      })),
    },
    gmail: vi.fn().mockImplementation(() => ({
      users: {
        getProfile: mockGetProfile,
        messages: { list: mockMessagesList, get: mockMessagesGet },
      },
    })),
  },
}));

const {
  connectEmailAccount,
  getAccountForUser,
  revokeEmailAccount,
  fetchEmailSummary,
  isGoogleOAuthConfigured,
  buildGoogleAuthUrl,
  connectGmailOAuth,
} = await import("./index");

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

  it("revoke flips status rather than deleting the row", async () => {
    await revokeEmailAccount("malachi");
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

describe("isGoogleOAuthConfigured", () => {
  const originalId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const originalSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  afterEach(() => {
    if (originalId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    else process.env.GOOGLE_OAUTH_CLIENT_SECRET = originalSecret;
  });

  it("is false when either env var is unset", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    expect(isGoogleOAuthConfigured()).toBe(false);
  });

  it("is true when both are set", () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "client-id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "client-secret";
    expect(isGoogleOAuthConfigured()).toBe(true);
  });
});

describe("buildGoogleAuthUrl", () => {
  it("requests offline access, forces consent, and the gmail.readonly scope", () => {
    buildGoogleAuthUrl("https://example.com/callback", "state-123");
    expect(mockGenerateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/gmail.readonly"],
      state: "state-123",
    });
  });
});

describe("connectGmailOAuth", () => {
  it("connects the account and clears any prior IMAP fields (malachi already has an IMAP connection from an earlier test)", async () => {
    mockGetToken.mockResolvedValue({ tokens: { refresh_token: "rt-abc", access_token: "at-abc" } });
    mockGetProfile.mockResolvedValue({ data: { emailAddress: "malachi@gmail.com" } });

    const account = await connectGmailOAuth("malachi", "https://example.com/callback", "auth-code-1");

    expect(account.authMethod).toBe("oauth_google");
    expect(account.provider).toBe("gmail");
    expect(account.emailAddress).toBe("malachi@gmail.com");

    const row = getDb()
      .prepare(`SELECT imap_host, imap_username, encrypted_password, encrypted_refresh_token FROM email_accounts WHERE user_id = 'malachi'`)
      .get() as { imap_host: string | null; imap_username: string | null; encrypted_password: string | null; encrypted_refresh_token: string | null };
    expect(row.imap_host).toBeNull();
    expect(row.imap_username).toBeNull();
    expect(row.encrypted_password).toBeNull();
    expect(row.encrypted_refresh_token).not.toBeNull();
  });

  it("throws a clear error if Google doesn't return a refresh token, without touching the existing row", async () => {
    mockGetToken.mockResolvedValue({ tokens: { access_token: "at-abc" } }); // no refresh_token
    await expect(connectGmailOAuth("malachi", "https://example.com/callback", "auth-code-2")).rejects.toThrow(/refresh token/);
    // Still connected via the previous successful call, untouched.
    expect(getAccountForUser("malachi")?.authMethod).toBe("oauth_google");
  });
});

describe("fetchEmailSummary — Gmail OAuth path", () => {
  it("uses the Gmail API and reuses the same importance classification as IMAP", async () => {
    mockGetToken.mockResolvedValue({ tokens: { refresh_token: "rt-xyz" } });
    mockGetProfile.mockResolvedValue({ data: { emailAddress: "malachi@gmail.com" } });
    await connectGmailOAuth("malachi", "https://example.com/callback", "auth-code-3");

    mockMessagesList.mockResolvedValue({ data: { messages: [{ id: "m1" }, { id: "m2" }], resultSizeEstimate: 7 } });
    mockMessagesGet.mockImplementation(async ({ id }: { id: string }) => {
      const headers =
        id === "m1"
          ? [
              { name: "Subject", value: "Electric bill due" },
              { name: "From", value: "City Power" },
            ]
          : [
              { name: "Subject", value: "50% off sale" },
              { name: "From", value: "Shop" },
            ];
      return { data: { payload: { headers } } };
    });

    const summary = await fetchEmailSummary("malachi");
    // resultSizeEstimate (7), not just the length of the fetched candidate batch (2) — same "total unread" meaning as IMAP's unreadUids.length.
    expect(summary.unreadCount).toBe(7);
    expect(summary.importantCount).toBe(1);
    expect(summary.importantMessages[0]!.subject).toBe("Electric bill due");
    expect(summary.importantMessages[0]!.webmailUrl).toBe("https://mail.google.com");
  });

  it("scopes to the Primary tab, not every category in the inbox (regression — found live 2026-08-02)", async () => {
    mockGetToken.mockResolvedValue({ tokens: { refresh_token: "rt-inbox-check" } });
    mockGetProfile.mockResolvedValue({ data: { emailAddress: "malachi@gmail.com" } });
    await connectGmailOAuth("malachi", "https://example.com/callback", "auth-code-4");

    mockMessagesList.mockResolvedValue({ data: { messages: [], resultSizeEstimate: 0 } });
    await fetchEmailSummary("malachi");

    // Gmail ANDs multiple labelIds together. UNREAD alone matches unread
    // mail anywhere in the account ("All Mail"); adding just INBOX still
    // wasn't enough for a tabbed-inbox account — INBOX covers every tab
    // (Primary/Social/Promotions/Updates) together, not the Primary tab
    // specifically, which is what a user actually means by "my inbox".
    // CATEGORY_PERSONAL is the real label ID behind the Primary tab.
    expect(mockMessagesList).toHaveBeenCalledWith(
      expect.objectContaining({ labelIds: ["INBOX", "UNREAD", "CATEGORY_PERSONAL"] })
    );
  });
});

describe("revokeEmailAccount — Gmail OAuth grant revocation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("best-effort revokes the Google grant, and still flips local status even if that call fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await revokeEmailAccount("malachi");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://oauth2.googleapis.com/revoke?token="),
      expect.objectContaining({ method: "POST" })
    );
    expect(getAccountForUser("malachi")?.status).toBe("revoked");
  });
});
