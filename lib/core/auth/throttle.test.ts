process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { checkLoginThrottle } from "./throttle";

const NOW = new Date("2026-08-02T18:00:00.000Z");

function insertFailedLogin(username: string, minutesAgo: number, createdAtFormat: "iso" | "sqlite" = "iso") {
  const at = new Date(NOW.getTime() - minutesAgo * 60_000);
  // Real login_failed rows are written via logSecurityEvent, which relies on
  // the schema's `datetime('now')` default (space-separated) — exercise both
  // that format and an explicit ISO string, since throttle.ts must handle
  // whichever one a given row happens to have (see the module's own comment).
  const createdAt = createdAtFormat === "iso" ? at.toISOString() : at.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  getDb()
    .prepare(`INSERT INTO security_events (id, type, user_id, detail, created_at) VALUES (?, 'login_failed', NULL, ?, ?)`)
    .run(randomUUID(), JSON.stringify({ username }), createdAt);
}

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  getDb().exec(schema);
});

describe("checkLoginThrottle", () => {
  it("allows a username with no recent failed attempts", () => {
    expect(checkLoginThrottle(getDb(), "grandma1", NOW)).toEqual({ locked: false });
  });

  it("allows up to 4 recent failed attempts (under the threshold of 5)", () => {
    for (let i = 0; i < 4; i++) insertFailedLogin("grandma2", 1);
    expect(checkLoginThrottle(getDb(), "grandma2", NOW)).toEqual({ locked: false });
  });

  it("locks once 5 recent failed attempts have accumulated", () => {
    for (let i = 0; i < 5; i++) insertFailedLogin("grandma3", 1);
    const result = checkLoginThrottle(getDb(), "grandma3", NOW);
    expect(result.locked).toBe(true);
    expect(result.retryAfterSeconds).toBe(15 * 60);
  });

  it("ignores attempts outside the 15-minute window", () => {
    for (let i = 0; i < 5; i++) insertFailedLogin("grandma4", 20);
    expect(checkLoginThrottle(getDb(), "grandma4", NOW)).toEqual({ locked: false });
  });

  it("counts attempts stored in SQLite's space-separated datetime('now') default format, not just ISO", () => {
    for (let i = 0; i < 5; i++) insertFailedLogin("grandma5", 1, "sqlite");
    expect(checkLoginThrottle(getDb(), "grandma5", NOW).locked).toBe(true);
  });

  it("scopes the count per-username — one account's failures don't lock out another", () => {
    for (let i = 0; i < 5; i++) insertFailedLogin("grandma6", 1);
    expect(checkLoginThrottle(getDb(), "someone-else", NOW)).toEqual({ locked: false });
  });
});
