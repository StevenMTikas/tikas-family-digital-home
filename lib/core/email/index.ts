// Email — the Standing Integration Connection service Email.md defines:
// a lightweight, read-only per-user email summary (unread/important counts,
// links to open in the user's real provider), not a full client. Connecting
// is itself the consent (Security_Architecture.md's Standing Integration
// Connection model) — no outside-call approval flow, and available to a
// minor's account since it's their own data. No raw email content is ever
// persisted; fetchEmailSummary connects live on every call.
//
// Gmail has a second auth path alongside IMAP+app-password: real "Sign in
// with Google" OAuth (2026-08-02, see Email.md). Every other provider
// (Outlook/Yahoo/iCloud/Other) still only has the IMAP path — those have
// their own separate OAuth systems, out of scope here.

import { randomUUID } from "crypto";
import { ImapFlow } from "imapflow";
import { google } from "googleapis";
import { getDb } from "@/db/client";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import { getModelForRole } from "@/lib/core/ai";
import { ollamaChat } from "@/lib/core/ai/ollama";

export type EmailAuthMethod = "imap" | "oauth_google";

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
  authMethod: EmailAuthMethod;
}

interface EmailAccountRow {
  id: string;
  provider: string;
  email_address: string;
  status: "connected" | "revoked";
  connected_at: string;
  auth_method: EmailAuthMethod;
}

function toRecord(row: EmailAccountRow): EmailAccountRecord {
  return {
    id: row.id,
    provider: row.provider,
    emailAddress: row.email_address,
    status: row.status,
    connectedAt: row.connected_at,
    authMethod: row.auth_method,
  };
}

export function getAccountForUser(userId: string): EmailAccountRecord | null {
  const row = getDb()
    .prepare(`SELECT id, provider, email_address, status, connected_at, auth_method FROM email_accounts WHERE user_id = ?`)
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

/**
 * Connects (or replaces) this user's account via IMAP — Email.md: "one
 * account per user for MVP." Explicitly sets auth_method = 'imap' and clears
 * encrypted_refresh_token so replacing a prior Gmail-OAuth connection with a
 * manual IMAP one (or vice versa, see connectGmailOAuth) never leaves stale
 * credentials from the other path sitting in the row.
 */
export function connectEmailAccount(input: ConnectEmailInput): EmailAccountRecord {
  const db = getDb();
  const encryptedPassword = encryptSecret(input.password, "email");
  const existing = db.prepare(`SELECT id FROM email_accounts WHERE user_id = ?`).get(input.userId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE email_accounts SET provider = ?, email_address = ?, status = 'connected', connected_at = datetime('now'),
       imap_host = ?, imap_port = ?, imap_username = ?, encrypted_password = ?, auth_method = 'imap', encrypted_refresh_token = NULL
       WHERE id = ?`
    ).run(input.provider, input.emailAddress, input.imapHost, input.imapPort, input.imapUsername, encryptedPassword, existing.id);
  } else {
    db.prepare(
      `INSERT INTO email_accounts (id, user_id, provider, email_address, status, imap_host, imap_port, imap_username, encrypted_password, auth_method)
       VALUES (?, ?, ?, ?, 'connected', ?, ?, ?, ?, 'imap')`
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

// ── Gmail OAuth ("Sign in with Google") ─────────────────────────────────
// Scope chosen deliberately broader than today's actual usage (subject/from
// only, for classifyImportant below): Steven's explicit call (2026-08-02) —
// gmail.readonly leaves room for a possible future "AI-suggested actions
// from email content" feature (Email.md's Future Enhancements) without
// re-requesting permission from every family member later.
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function getGoogleOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri);
}

/**
 * The consent-screen URL to send the user to. `redirectUri` is computed
 * per-request by the caller (the start route) from the actual incoming
 * host — Google just needs whichever host is used to also be registered as
 * an authorized redirect URI for this Client ID; the app doesn't hardcode
 * one, so it works the same from localhost and a Tailscale hostname.
 * `prompt: "consent"` guarantees a refresh_token is issued even on a repeat
 * connection, not just the very first one.
 */
export function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  return getGoogleOAuthClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GMAIL_SCOPE],
    state,
  });
}

/** Exchanges the OAuth code for tokens, discovers the connected address, and connects (or replaces) this user's account — same one-account-per-user semantics as connectEmailAccount. */
export async function connectGmailOAuth(userId: string, redirectUri: string, code: string): Promise<EmailAccountRecord> {
  const oauth2Client = getGoogleOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    // Shouldn't happen with prompt: "consent" above, but Google's own docs
    // flag this as a real edge case (e.g. a prior grant in an unusual
    // state) — fail clearly rather than silently storing nothing to refresh with.
    throw new Error("Google didn't return a refresh token — try connecting again.");
  }
  oauth2Client.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const emailAddress = profile.data.emailAddress;
  if (!emailAddress) throw new Error("Google didn't return the connected account's email address.");

  const db = getDb();
  const encryptedRefreshToken = encryptSecret(tokens.refresh_token, "email");
  const existing = db.prepare(`SELECT id FROM email_accounts WHERE user_id = ?`).get(userId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE email_accounts SET provider = 'gmail', email_address = ?, status = 'connected', connected_at = datetime('now'),
       auth_method = 'oauth_google', encrypted_refresh_token = ?,
       imap_host = NULL, imap_port = NULL, imap_username = NULL, encrypted_password = NULL
       WHERE id = ?`
    ).run(emailAddress, encryptedRefreshToken, existing.id);
  } else {
    db.prepare(
      `INSERT INTO email_accounts (id, user_id, provider, email_address, status, auth_method, encrypted_refresh_token)
       VALUES (?, ?, 'gmail', ?, 'connected', 'oauth_google', ?)`
    ).run(randomUUID(), userId, emailAddress, encryptedRefreshToken);
  }

  return getAccountForUser(userId)!;
}

/** Revoke — the connecting user or an admin (Email.md). Status flip, not delete, matching the Standing Integration Connection revoke pattern in Administration's Internet Access tab. For a Gmail-OAuth account, also best-effort revokes the grant at Google so it doesn't linger in the user's "Third-party apps with account access" list. */
export async function revokeEmailAccount(userId: string): Promise<void> {
  const db = getDb();
  const row = db
    .prepare(`SELECT auth_method, encrypted_refresh_token FROM email_accounts WHERE user_id = ?`)
    .get(userId) as { auth_method: EmailAuthMethod; encrypted_refresh_token: string | null } | undefined;

  if (row?.auth_method === "oauth_google" && row.encrypted_refresh_token) {
    try {
      const refreshToken = decryptSecret(row.encrypted_refresh_token, "email");
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" });
    } catch (err) {
      // Don't block the local revoke on Google's endpoint being unreachable
      // — the connection is unusable locally either way once status flips.
      console.error("[email] Failed to revoke Google OAuth grant:", err);
    }
  }

  db.prepare(`UPDATE email_accounts SET status = 'revoked' WHERE user_id = ?`).run(userId);
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

interface EmailAccountConnectionRow {
  auth_method: EmailAuthMethod;
  provider: string;
  imap_host: string | null;
  imap_port: number | null;
  imap_username: string | null;
  encrypted_password: string | null;
  encrypted_refresh_token: string | null;
}

async function fetchImapSummary(row: EmailAccountConnectionRow): Promise<EmailSummary> {
  const client = new ImapFlow({
    host: row.imap_host!,
    port: row.imap_port!,
    secure: true,
    auth: { user: row.imap_username!, pass: decryptSecret(row.encrypted_password!, "email") },
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

/** Same shape/result as fetchImapSummary, via the Gmail API instead of IMAP — reuses the same classifyImportant() step. */
async function fetchGmailOAuthSummary(row: EmailAccountConnectionRow): Promise<EmailSummary> {
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({ refresh_token: decryptSecret(row.encrypted_refresh_token!, "email") });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Gmail's API ANDs multiple labelIds together. INBOX alone still wasn't
  // enough — found live (2026-08-02): for an account with Gmail's tabbed
  // inbox (Primary/Social/Promotions/Updates/Forums) turned on, the INBOX
  // system label covers *all* those tabs together, not just what the user
  // actually sees as "my inbox" (the Primary tab). CATEGORY_PERSONAL is the
  // real label ID behind the Primary tab specifically — adding it is what
  // actually matches what a tabbed-inbox user expects "unread in my inbox"
  // to mean. (For an account with tabs turned off, Gmail merges everything
  // into one view but still applies category labels behind the scenes, so
  // this could under-count for that setup — no way to detect that from the
  // API, and not this household's actual case, so not solved for here.)
  const list = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["INBOX", "UNREAD", "CATEGORY_PERSONAL"],
    maxResults: MAX_MESSAGES_TO_CLASSIFY,
  });
  const messageIds = list.data.messages ?? [];

  const candidates: FlaggedMessage[] = [];
  for (const { id } of messageIds) {
    if (!id) continue;
    const message = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    const headers = message.data.payload?.headers ?? [];
    const header = (name: string) => headers.find((h) => h.name === name)?.value ?? null;
    const dateHeader = header("Date");
    candidates.push({
      subject: header("Subject") ?? "(no subject)",
      from: header("From") ?? "Unknown sender",
      date: dateHeader ? new Date(dateHeader).toISOString() : null,
      webmailUrl: webmailUrlFor(row.provider),
    });
  }

  const importantIndexes = await classifyImportant(candidates.map((c) => ({ subject: c.subject, from: c.from })));
  const importantMessages = importantIndexes.map((i) => candidates[i]).filter((c): c is FlaggedMessage => !!c);

  // resultSizeEstimate is Gmail's own approximate count for the query/label,
  // not limited to the MAX_MESSAGES_TO_CLASSIFY candidates fetched above —
  // same "total unread" meaning as IMAP's unreadUids.length.
  return { unreadCount: list.data.resultSizeEstimate ?? messageIds.length, importantCount: importantMessages.length, importantMessages };
}

/** Fetches a live unread/important summary. Throws if no account is connected — callers should check getAccountForUser first. */
export async function fetchEmailSummary(userId: string): Promise<EmailSummary> {
  const row = getDb()
    .prepare(
      `SELECT auth_method, provider, imap_host, imap_port, imap_username, encrypted_password, encrypted_refresh_token
       FROM email_accounts WHERE user_id = ? AND status = 'connected'`
    )
    .get(userId) as EmailAccountConnectionRow | undefined;
  if (!row) throw new Error("No connected email account.");

  return row.auth_method === "oauth_google" ? fetchGmailOAuthSummary(row) : fetchImapSummary(row);
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
