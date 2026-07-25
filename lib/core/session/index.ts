// Shared session service — issues and verifies the login session cookie.
// See docs/04_Permissions/Authentication.md: username/password login,
// indefinite sessions on trusted devices, no forced re-authentication.
//
// The cookie is HMAC-signed (not just the raw user id) so a family member
// can't grant themselves another account's access by editing their own
// cookie — the client device is the same device the account holder uses.

import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE_NAME = "tikas_session";

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set — see .env.example");
  return value;
}

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("hex");
}

/** Value to set as the session cookie after a successful login. */
export function createSessionCookieValue(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

/** Returns the authenticated user id, or null if the cookie is missing/invalid. */
export function verifySessionCookieValue(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const [userId, signature] = cookieValue.split(".");
  if (!userId || !signature) return null;

  const expected = sign(userId);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return null;

  return timingSafeEqual(expectedBuf, actualBuf) ? userId : null;
}
