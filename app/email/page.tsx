"use client";

// Email module. See docs/02_Modules/Email.md: a lightweight, read-only
// summary (unread/important counts, links to open in the real provider) via
// a Standing Integration Connection — connecting is itself the consent, no
// outside-call approval flow, available to any user including a minor. No
// initial server-fetched data (this is the user's own account only), so —
// like Search — this is a single client component rather than a
// page.tsx/PageClient.tsx split.

import { useEffect, useState } from "react";
import {
  getEmailAccount,
  connectEmail,
  revokeEmail,
  getEmailSummary,
  EmailApiError,
  type EmailAccount,
  type EmailSummary,
} from "@/lib/api/email";

const PROVIDER_PRESETS: Record<string, { imapHost: string; imapPort: number }> = {
  gmail: { imapHost: "imap.gmail.com", imapPort: 993 },
  outlook: { imapHost: "outlook.office365.com", imapPort: 993 },
  yahoo: { imapHost: "imap.mail.yahoo.com", imapPort: 993 },
  icloud: { imapHost: "imap.mail.me.com", imapPort: 993 },
};

export default function EmailPage() {
  const [account, setAccount] = useState<EmailAccount | null | undefined>(undefined);
  const [summary, setSummary] = useState<EmailSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [provider, setProvider] = useState("gmail");
  const [emailAddress, setEmailAddress] = useState("");
  const [imapHost, setImapHost] = useState(PROVIDER_PRESETS.gmail!.imapHost);
  const [imapPort, setImapPort] = useState(PROVIDER_PRESETS.gmail!.imapPort);
  const [imapUsername, setImapUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    getEmailAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    if (account?.status !== "connected") return;
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.status]);

  function loadSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    getEmailSummary()
      .then(setSummary)
      .catch((err) => setSummaryError(err instanceof EmailApiError ? err.message : "Couldn't load your email summary."))
      .finally(() => setSummaryLoading(false));
  }

  function handleProviderChange(next: string) {
    setProvider(next);
    const preset = PROVIDER_PRESETS[next];
    if (preset) {
      setImapHost(preset.imapHost);
      setImapPort(preset.imapPort);
    }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (connecting) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const connected = await connectEmail({
        provider,
        emailAddress: emailAddress.trim(),
        imapHost: imapHost.trim(),
        imapPort,
        imapUsername: imapUsername.trim() || emailAddress.trim(),
        password,
      });
      setAccount(connected);
      setPassword("");
    } catch (err) {
      setConnectError(err instanceof EmailApiError ? err.message : "Couldn't connect that account. Try again.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleRevoke() {
    await revokeEmail().catch(() => {});
    setAccount(null);
    setSummary(null);
  }

  if (account === undefined) {
    return (
      <main className="p-6 max-w-[560px]">
        <h1 className="font-display text-2xl font-medium">Email</h1>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-[560px]">
      <h1 className="font-display text-2xl font-medium">Email</h1>
      <p className="text-ink-muted text-sm mt-1">
        A quick glance at your unread and important messages — not a full inbox.
      </p>

      {account?.status === "connected" ? (
        <>
          <div className="bg-surface rounded-2xl p-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)] mt-5 flex items-center justify-between">
            <div>
              <div className="text-[13.5px] text-ink font-medium">{account.emailAddress}</div>
              <div className="text-xs text-ink-muted mt-0.5 capitalize">{account.provider}</div>
            </div>
            <button type="button" onClick={handleRevoke} className="text-xs text-urgent font-medium">
              Disconnect
            </button>
          </div>

          <div className="mt-5">
            {summaryLoading && <p className="text-sm text-ink-muted">Checking your inbox…</p>}
            {summaryError && (
              <div className="text-sm text-urgent">
                {summaryError}{" "}
                <button type="button" onClick={loadSummary} className="underline">
                  Retry
                </button>
              </div>
            )}
            {summary && !summaryLoading && (
              <>
                <div className="flex gap-3">
                  <div className="flex-1 bg-surface rounded-2xl p-4 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
                    <div className="text-2xl font-display font-medium text-ink">{summary.unreadCount}</div>
                    <div className="text-xs text-ink-muted mt-0.5">Unread</div>
                  </div>
                  <div className="flex-1 bg-surface rounded-2xl p-4 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
                    <div className="text-2xl font-display font-medium text-ink">{summary.importantCount}</div>
                    <div className="text-xs text-ink-muted mt-0.5">Look important</div>
                  </div>
                </div>

                {summary.importantMessages.length > 0 && (
                  <div className="flex flex-col gap-2 mt-4">
                    {summary.importantMessages.map((m, i) => (
                      <a
                        key={i}
                        href={m.webmailUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-surface rounded-2xl p-4 shadow-[0_8px_20px_rgba(58,52,44,0.05)] block"
                      >
                        <div className="text-[13px] text-ink font-medium">{m.subject}</div>
                        <div className="text-xs text-ink-muted mt-0.5">{m.from}</div>
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={handleConnect} className="bg-surface rounded-2xl p-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)] mt-5 flex flex-col gap-3.5">
          <div className="text-sm font-semibold text-ink">Connect Email Account</div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Provider</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="gmail">Gmail</option>
              <option value="outlook">Outlook</option>
              <option value="yahoo">Yahoo</option>
              <option value="icloud">iCloud</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Email address</label>
            <input
              type="email"
              required
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-ink mb-1.5">IMAP host</label>
              <input
                type="text"
                required
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div className="w-[100px]">
              <label className="block text-xs font-semibold text-ink mb-1.5">Port</label>
              <input
                type="number"
                required
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Username (defaults to your email address)</label>
            <input
              type="text"
              value={imapUsername}
              onChange={(e) => setImapUsername(e.target.value)}
              placeholder={emailAddress}
              className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Password (use an app password if your provider requires one)
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          {connectError && (
            <p role="alert" className="text-xs text-urgent">
              {connectError}
            </p>
          )}

          <button
            type="submit"
            disabled={connecting}
            className="px-5 py-2.5 rounded-full bg-accent-strong text-white text-[13.5px] font-medium disabled:opacity-60 self-start"
          >
            {connecting ? "Connecting…" : "Connect"}
          </button>
        </form>
      )}
    </main>
  );
}
