// Thin typed API client for Email — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export interface EmailAccount {
  id: string;
  provider: string;
  emailAddress: string;
  status: "connected" | "revoked";
  connectedAt: string;
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

export interface ConnectEmailInput {
  provider: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  password: string;
}

export class EmailApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new EmailApiError(body?.error?.message ?? "Request failed.");
  }
  return res.json();
}

export async function getEmailAccount(): Promise<EmailAccount | null> {
  const data = await unwrap<{ account: EmailAccount | null }>(await fetch("/api/email"));
  return data.account;
}

export async function connectEmail(input: ConnectEmailInput): Promise<EmailAccount> {
  const data = await unwrap<{ account: EmailAccount }>(
    await fetch("/api/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  return data.account;
}

export async function revokeEmail(): Promise<void> {
  await unwrap(await fetch("/api/email", { method: "DELETE" }));
}

export async function getEmailSummary(): Promise<EmailSummary> {
  return unwrap(await fetch("/api/email/summary"));
}
