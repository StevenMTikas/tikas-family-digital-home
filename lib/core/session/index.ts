// Shared session service — issues and verifies the login session cookie.
// See docs/04_Permissions/Authentication.md: username/password login,
// indefinite sessions on trusted devices, no forced re-authentication.
//
// The cookie is HMAC-signed (not just the raw user id) so a family member
// can't grant themselves another account's access by editing their own
// cookie — the client device is the same device the account holder uses.
//
// Format is `<userId>.<expiresAtEpochMs|empty>.<signature>` (2026-08, was
// `<userId>.<signature>`) — the empty expiry segment preserves indefinite
// sessions exactly as before for every internal role; only the new
// external_viewer login path (app/api/family-view/auth/login) ever passes a
// real expiry, since that account type is reachable from the open internet
// via Tailscale Funnel rather than only the trusted home tailnet. Expiry is
// part of the signed payload so it can't be stripped or extended by editing
// the cookie. This is a defense-in-depth control against a leaked/shared
// external-viewer cookie, not a revocation mechanism — actual access is
// always re-checked fresh on every request regardless (getAuthUser,
// canAccessFolder, hasPermission), per Authorization.md.

import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "tikas_session";

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set — see .env.example");
  return value;
}

function sign(userId: string, expiresAt: string): string {
  return createHmac("sha256", secret()).update(`${userId}.${expiresAt}`).digest("hex");
}

/**
 * Value to set as the session cookie after a successful login. Omit
 * `expiresAtEpochMs` for an indefinite session (every internal role, as
 * today); pass it for a session that stops verifying once that time passes
 * (external_viewer's 30-day TTL).
 */
export function createSessionCookieValue(userId: string, expiresAtEpochMs?: number): string {
  const expiresAt = expiresAtEpochMs !== undefined ? String(expiresAtEpochMs) : "";
  return `${userId}.${expiresAt}.${sign(userId, expiresAt)}`;
}

/** Returns the authenticated user id, or null if the cookie is missing/invalid/expired. */
export function verifySessionCookieValue(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;
  if (!userId || !signature) return null;

  const expected = sign(userId, expiresAt!);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

  if (expiresAt) {
    const expiresAtMs = Number(expiresAt);
    if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return null;
  }

  return userId;
}
