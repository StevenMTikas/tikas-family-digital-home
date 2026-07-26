process.env.SESSION_SECRET = "test-session-secret";

import { describe, it, expect } from "vitest";
import { createSessionCookieValue, verifySessionCookieValue, SESSION_COOKIE_NAME } from "./index";

// Testing.md calls out "security-critical paths" for disproportionate
// coverage; this is the mechanism every single authenticated request relies
// on (middleware.ts verifies this cookie on every request) — a bug here
// would mean either locking everyone out, or worse, letting a tampered
// cookie forge a session for an arbitrary user id.

describe("createSessionCookieValue / verifySessionCookieValue", () => {
  it("round-trips a valid session for the same user id", () => {
    const value = createSessionCookieValue("dad");
    expect(verifySessionCookieValue(value)).toBe("dad");
  });

  it("produces different signatures for different user ids", () => {
    const dad = createSessionCookieValue("dad");
    const vee = createSessionCookieValue("vee");
    expect(dad).not.toBe(vee);
  });

  it("rejects a cookie with the user id swapped but the original signature kept — the core forgery case", () => {
    const dadCookie = createSessionCookieValue("dad");
    const [, signature] = dadCookie.split(".");
    const forged = `vee.${signature}`;
    expect(verifySessionCookieValue(forged)).toBeNull();
  });

  it("rejects a cookie with any single character of the signature altered", () => {
    const value = createSessionCookieValue("dad");
    const [userId, signature] = value.split(".");
    const flippedChar = signature![0] === "a" ? "b" : "a";
    const tampered = `${userId}.${flippedChar}${signature!.slice(1)}`;
    expect(verifySessionCookieValue(tampered)).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(verifySessionCookieValue("not-a-valid-cookie")).toBeNull();
    expect(verifySessionCookieValue("")).toBeNull();
    expect(verifySessionCookieValue("dad.")).toBeNull();
    expect(verifySessionCookieValue(".signature")).toBeNull();
  });

  it("returns null for undefined (no cookie present)", () => {
    expect(verifySessionCookieValue(undefined)).toBeNull();
  });

  it("rejects a signature that's a different length than expected, without throwing", () => {
    const value = createSessionCookieValue("dad");
    const [userId] = value.split(".");
    // A shorter-than-expected signature must fail cleanly (not throw) —
    // this exercises the length-check guard before the timingSafeEqual call,
    // since timingSafeEqual itself throws on mismatched buffer lengths.
    expect(() => verifySessionCookieValue(`${userId}.short`)).not.toThrow();
    expect(verifySessionCookieValue(`${userId}.short`)).toBeNull();
  });

  it("SESSION_COOKIE_NAME is a stable constant", () => {
    expect(SESSION_COOKIE_NAME).toBe("tikas_session");
  });
});
