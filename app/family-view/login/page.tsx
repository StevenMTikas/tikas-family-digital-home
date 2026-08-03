"use client";

// External Viewer login screen — near-clone of app/login/page.tsx, posting
// to the separate /api/family-view/auth/login route (see
// lib/api/familyViewAuth.ts). This is the only login surface reachable from
// the open internet (path-scoped Tailscale Funnel) — see
// Security_Architecture.md.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginExternalViewer, ExternalLoginError } from "@/lib/api/familyViewAuth";

export default function ExternalViewerLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginExternalViewer(username, password);
      router.push("/family-view/photos");
      router.refresh();
    } catch (err) {
      setError(err instanceof ExternalLoginError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen w-full bg-base font-body text-ink flex items-center justify-center px-4">
      <div className="relative overflow-hidden bg-surface rounded-[20px] w-full max-w-[400px] px-11 py-12 shadow-[0_20px_50px_rgba(58,52,44,0.08)]">
        <div
          className="absolute -top-[90px] left-1/2 -translate-x-1/2 w-[280px] h-[280px] rounded-full pointer-events-none bg-[radial-gradient(circle,rgba(201,138,62,0.24)_0%,rgba(201,138,62,0)_70%)]"
          aria-hidden="true"
        />

        <div className="relative flex flex-col items-center">
          <div className="w-[52px] h-[52px] rounded-[15px] bg-accent flex items-center justify-center mb-4">
            <div className="w-[18px] h-[18px] rounded-full bg-white opacity-90" />
          </div>
          <div className="font-display text-2xl font-semibold text-ink">Tikas</div>
          <div className="text-[13px] text-ink-muted mt-0.5">Family Sharing</div>
        </div>

        <form onSubmit={handleSubmit} className="relative mt-8 flex flex-col gap-3.5">
          <div>
            <label htmlFor="username" className="block text-xs font-semibold text-ink mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-[11px] rounded-xl border border-ink/15 text-sm font-body text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-ink mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-[11px] rounded-xl border border-ink/15 text-sm font-body text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-urgent">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="text-sm font-semibold text-white bg-accent-strong py-3 rounded-xl text-center disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? "Logging in…" : "Log In"}
          </button>
        </form>

        <div className="relative mt-5 text-[11.5px] text-ink-muted text-center leading-relaxed">
          Access shared by a family member. Contact them if you've lost your login details.
        </div>
      </div>
    </main>
  );
}
