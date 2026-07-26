// Email — the Standing Integration Connection service Email.md defines:
// a lightweight, read-only per-user email summary (unread/important counts,
// links to open in the user's real provider), not a full client. Connecting
// is itself the consent (Security_Architecture.md's Standing Integration
// Connection model) — no outside-call approval flow, and available to a
// minor's account since it's their own data. No raw email content is ever
// persisted; fetchEmailSummary connects live on every call.

import { randomUUID } from "crypto";
import { ImapFlow } from "imapflow";
import { getDb } from "@/db/client";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import { getModelForRole } from "@/lib/core/ai";
import { ollamaChat } from "@/lib/core/ai/ollama";

export interface ConnectEmailInput {
  userId: string;
  provider: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  password: string;
}

export interface EmailAccountRecord {
  id: string;
  provider: string;
  emailAddress: string;
  status: "connected" | "revoked";
  connectedAt: string;
}

interface EmailAccountRow {
  id: string;
  provider: string;
  email_address: string;
  status: "connected" | "revoked";
  connected_at: string;
}

function toRecord(row: EmailAccountRow): EmailAccountRecord {
  return { id: row.id, provider: row.provider, emailAddress: row.email_address, status: row.status, connectedAt: row.connected_at };
}

export function getAccountForUser(userId: string): EmailAccountRecord | null {
  const row = getDb()
    .prepare(`SELECT id, provider, email_address, status, connected_at FROM email_accounts WHERE user_id = ?`)
    .get(userId) as EmailAccountRow | undefined;
  return row ? toRecord(row) : null;
}

/** Verifies IMAP credentials work before they're saved — a failed connect attempt is better surfaced immediately than on the next summary fetch. */
export async function verifyImapCredentials(input: Pick<ConnectEmailInput, "imapHost" | "imapPort" | "imapUsername" | "password">): Promise<boolean> {
  const client = new ImapFlow({
    host: input.imapHost,
    port: input.imapPort,
    secure: true,
    auth: { user: input.imapUsername, pass: input.password },
    logger: false,
  });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Connects (or replaces) this user's account — Email.md: "one account per user for MVP." */
export function connectEmailAccount(input: ConnectEmailInput): EmailAccountRecord {
  const db = getDb();
  const encryptedPassword = encryptSecret(input.password, "email");
  const existing = db.prepare(`SELECT id FROM email_accounts WHERE user_id = ?`).get(input.userId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE email_accounts SET provider = ?, email_address = ?, status = 'connected', connected_at = datetime('now'),
       imap_host = ?, imap_port = ?, imap_username = ?, encrypted_password = ? WHERE id = ?`
    ).run(input.provider, input.emailAddress, input.imapHost, input.imapPort, input.imapUsername, encryptedPassword, existing.id);
  } else {
    db.prepare(
      `INSERT INTO email_accounts (id, user_id, provider, email_address, status, imap_host, imap_port, imap_username, encrypted_password)
       VALUES (?, ?, ?, ?, 'connected', ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      input.userId,
      input.provider,
      input.emailAddress,
      input.imapHost,
      input.imapPort,
      input.imapUsername,
      encryptedPassword
    );
  }

  return getAccountForUser(input.userId)!;
}

/** Revoke — the connecting user or an admin (Email.md). Status flip, not delete, matching the Standing Integration Connection revoke pattern in Administration's Internet Access tab. */
export function revokeEmailAccount(userId: string): void {
  getDb().prepare(`UPDATE email_accounts SET status = 'revoked' WHERE user_id = ?`).run(userId);
}

export interface FlaggedMessage {
  subject: string;
  from: string;
  date: string | null;
  webmailUrl: string;
}

export interface EmailSummary {
  unreadCount: number;
  importantCount: number;
  importantMessages: FlaggedMessage[];
}

const WEBMAIL_URLS: Record<string, string> = {
  gmail: "https://mail.google.com",
  outlook: "https://outlook.com",
  yahoo: "https://mail.yahoo.com",
  icloud: "https://www.icloud.com/mail",
};

function webmailUrlFor(provider: string): string {
  return WEBMAIL_URLS[provider.toLowerCase()] ?? "https://";
}

// Only fetch/classify the most recent unread messages — Email.md's
// "lightweight summary," not a full inbox sync.
const MAX_MESSAGES_TO_CLASSIFY = 25;

/** Fetches a live unread/important summary. Throws if no account is connected — callers should check getAccountForUser first. */
export async function fetchEmailSummary(userId: string): Promise<EmailSummary> {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT imap_host, imap_port, imap_username, encrypted_password, provider FROM email_accounts WHERE user_id = ? AND status = 'connected'`
    )
    .get(userId) as
    | { imap_host: string; imap_port: number; imap_username: string; encrypted_password: string; provider: string }
    | undefined;
  if (!row) throw new Error("No connected email account.");

  const client = new ImapFlow({
    host: row.imap_host,
    port: row.imap_port,
    secure: true,
    auth: { user: row.imap_username, pass: decryptSecret(row.encrypted_password, "email") },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const unreadUids = ((await client.search({ seen: false }, { uid: true })) || []) as number[];
      const candidateUids = unreadUids.slice(-MAX_MESSAGES_TO_CLASSIFY);

      const candidates: FlaggedMessage[] = [];
      if (candidateUids.length > 0) {
        for await (const message of client.fetch(candidateUids, { envelope: true }, { uid: true })) {
          const from = message.envelope?.from?.[0];
          candidates.push({
            subject: message.envelope?.subject ?? "(no subject)",
            from: from?.name || from?.address || "Unknown sender",
            date: message.envelope?.date ? new Date(message.envelope.date).toISOString() : null,
            webmailUrl: webmailUrlFor(row.provider),
          });
        }
      }

      const importantIndexes = await classifyImportant(candidates.map((c) => ({ subject: c.subject, from: c.from })));
      const importantMessages = importantIndexes.map((i) => candidates[i]).filter((c): c is FlaggedMessage => !!c);

      return { unreadCount: unreadUids.length, importantCount: importantMessages.length, importantMessages };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Email.md: "importance is determined locally via Ollama" — a lighter classification task, not an outside frontier-model call. */
async function classifyImportant(messages: { subject: string; from: string }[]): Promise<number[]> {
  if (messages.length === 0) return [];

  const model = getModelForRole("guardian"); // the fast local model — this runs live while a user waits, not in the background
  const list = messages.map((m, i) => `${i}. From: ${m.from} — Subject: ${m.subject}`).join("\n");

  const reply = await ollamaChat(model, [
    {
      role: "system",
      content:
        "You classify unread emails by likely importance for a household member — bills, school, medical, and urgent " +
        "personal matters are important; newsletters, marketing, and routine automated notifications are not. Respond " +
        "with ONLY a JSON array of the 0-based indexes of the important messages (e.g. [0,2]), or [] if none are important.",
    },
    { role: "user", content: list },
  ]);

  try {
    const parsed = JSON.parse(reply.content.trim());
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return []; // a malformed classification shouldn't break the unread count itself
  }
}
