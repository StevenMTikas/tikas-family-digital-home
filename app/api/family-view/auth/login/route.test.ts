process.env.DATABASE_PATH = ":memory:";
process.env.SESSION_SECRET = "test-session-secret";

import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { POST } from "./route";

const PASSWORD = "grandma-secret-1";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../../db/schema.sql"), "utf8"));
  const hash = bcrypt.hashSync(PASSWORD, 10);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('grandma', 'grandma.view', ?, 'Grandma', 'external_viewer')`
  ).run(hash);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.tikas', ?, 'Dad', 'super_admin')`
  ).run(hash);
});

beforeEach(() => {
  getDb().exec(`DELETE FROM security_events;`);
});

function loginReq(body: unknown) {
  return new NextRequest("http://localhost/api/family-view/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/family-view/auth/login", () => {
  it("requires username and password", async () => {
    const res = await POST(loginReq({ username: "grandma.view" }));
    expect(res.status).toBe(400);
  });

  it("logs in a real external_viewer with correct credentials", async () => {
    const res = await POST(loginReq({ username: "grandma.view", password: PASSWORD }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: "grandma", username: "grandma.view", fullName: "Grandma", role: "external_viewer" });
  });

  it("sets a signed session cookie with a finite 30-day expiry, not an indefinite one", async () => {
    const res = await POST(loginReq({ username: "grandma.view", password: PASSWORD }));
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tikas_session=");
    const cookieValue = setCookie.split(";")[0]!.split("=")[1]!;
    const [, expiresAt] = cookieValue.split(".");
    expect(expiresAt).not.toBe("");
    expect(Number(expiresAt)).toBeGreaterThan(Date.now());
  });

  it("rejects a wrong password with a generic error", async () => {
    const res = await POST(loginReq({ username: "grandma.view", password: "wrong" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects a real family member's correct credentials — this surface is external_viewer only", async () => {
    const res = await POST(loginReq({ username: "dad.tikas", password: PASSWORD }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("gives byte-for-byte the same response for 'wrong password' and 'right password, wrong role', so the outside can't distinguish them", async () => {
    const wrongPassword = await POST(loginReq({ username: "grandma.view", password: "wrong" }));
    const wrongRole = await POST(loginReq({ username: "dad.tikas", password: PASSWORD }));
    expect(await wrongPassword.json()).toEqual(await wrongRole.json());
    expect(wrongPassword.status).toBe(wrongRole.status);
  });

  it("rejects an unknown username the same way", async () => {
    const res = await POST(loginReq({ username: "nobody", password: "whatever" }));
    expect(res.status).toBe(401);
  });

  it("locks out after 5 failed attempts within the window", async () => {
    for (let i = 0; i < 5; i++) {
      await POST(loginReq({ username: "grandma.view", password: "wrong" }));
    }
    const res = await POST(loginReq({ username: "grandma.view", password: PASSWORD }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("logs a login_failed security event on bad credentials, and a login event on success", async () => {
    await POST(loginReq({ username: "grandma.view", password: "wrong" }));
    const failedEvents = getDb().prepare(`SELECT type FROM security_events WHERE type = 'login_failed'`).all();
    expect(failedEvents).toHaveLength(1);

    await POST(loginReq({ username: "grandma.view", password: PASSWORD }));
    const loginEvents = getDb().prepare(`SELECT type FROM security_events WHERE type = 'login'`).all();
    expect(loginEvents).toHaveLength(1);
  });
});
