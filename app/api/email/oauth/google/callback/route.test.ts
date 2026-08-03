process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";

vi.mock("@/lib/core/email", () => ({
  connectGmailOAuth: vi.fn(async () => undefined),
}));

const { connectGmailOAuth } = await import("@/lib/core/email");
const { GET } = await import("./route");

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
});

function callbackReq(opts: { userId?: string | null; query?: string; stateCookie?: string }) {
  const url = `http://localhost/api/email/oauth/google/callback${opts.query ?? ""}`;
  const headers: Record<string, string> = {};
  if (opts.userId) headers["x-user-id"] = opts.userId;
  if (opts.stateCookie !== undefined) headers["cookie"] = `google_oauth_state=${opts.stateCookie}`;
  return new NextRequest(url, { headers });
}

describe("GET /api/email/oauth/google/callback", () => {
  it("redirects to /login when there's no authenticated session", async () => {
    const res = await GET(callbackReq({ userId: null, query: "?code=abc&state=xyz" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("fails with oauth_denied when Google omits the code (user declined consent)", async () => {
    const res = await GET(callbackReq({ userId: "dad", query: "?state=xyz", stateCookie: "xyz" }));
    expect(res.headers.get("location")).toContain("error=oauth_denied");
    expect(connectGmailOAuth).not.toHaveBeenCalled();
  });

  it("fails with oauth_state when the state cookie is missing entirely", async () => {
    const res = await GET(callbackReq({ userId: "dad", query: "?code=abc&state=xyz" }));
    expect(res.headers.get("location")).toContain("error=oauth_state");
    expect(connectGmailOAuth).not.toHaveBeenCalled();
  });

  it("fails with oauth_state when the query state doesn't match the cookie (CSRF mismatch)", async () => {
    const res = await GET(callbackReq({ userId: "dad", query: "?code=abc&state=attacker-supplied", stateCookie: "real-state" }));
    expect(res.headers.get("location")).toContain("error=oauth_state");
    expect(connectGmailOAuth).not.toHaveBeenCalled();
  });

  it("fails with oauth_state when the query is missing state but a cookie exists", async () => {
    const res = await GET(callbackReq({ userId: "dad", query: "?code=abc", stateCookie: "real-state" }));
    expect(res.headers.get("location")).toContain("error=oauth_state");
  });

  it("proceeds to connect when state matches the cookie exactly", async () => {
    const res = await GET(callbackReq({ userId: "dad", query: "?code=abc&state=matching", stateCookie: "matching" }));
    expect(connectGmailOAuth).toHaveBeenCalledWith("dad", expect.stringContaining("/api/email/oauth/google/callback"), "abc");
    expect(res.headers.get("location")).toContain("connected=1");
  });

  it("clears the state cookie on both success and failure", async () => {
    const failRes = await GET(callbackReq({ userId: "dad", query: "?state=xyz", stateCookie: "xyz" }));
    expect(failRes.headers.get("set-cookie")).toContain("google_oauth_state=;");

    const okRes = await GET(callbackReq({ userId: "dad", query: "?code=abc&state=matching2", stateCookie: "matching2" }));
    expect(okRes.headers.get("set-cookie")).toContain("google_oauth_state=;");
  });

  it("redirects to an error when connectGmailOAuth throws", async () => {
    vi.mocked(connectGmailOAuth).mockRejectedValueOnce(new Error("token exchange failed"));
    const res = await GET(callbackReq({ userId: "dad", query: "?code=abc&state=matching3", stateCookie: "matching3" }));
    expect(res.headers.get("location")).toContain("error=oauth_failed");
  });
});
