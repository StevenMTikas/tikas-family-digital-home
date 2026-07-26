// Testing.md calls out "the outside-call approval flow, including the
// sensitive-data gate and its unavailability to minors" by name as a
// security-critical path needing disproportionate coverage.

process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { requestOutsideCallApproval, isAiEnabledForUser } from "./index";

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);

  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission, ai_enabled)
     VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`
  ).run("dad", "dad.test", "Dad", "super_admin", 0, 0, 1);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission, ai_enabled)
     VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`
  ).run("vee-full", "vee-full.test", "Vee Full", "admin", 1, 1, 1);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission, ai_enabled)
     VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`
  ).run("vee-basic", "vee-basic.test", "Vee Basic", "admin", 1, 0, 1);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, approve_sensitive_outside_transmission, ai_enabled)
     VALUES (?, ?, 'x', ?, ?, ?, ?, ?)`
  ).run("malachi", "malachi.test", "Malachi", "basic_user", 0, 0, 0);
});

describe("requestOutsideCallApproval", () => {
  it("Super Admin can send non-sensitive data despite the flag being off (bypass)", async () => {
    expect(await requestOutsideCallApproval({ userId: "dad", agent: "assistant" }, "a photo", false)).toBe(true);
  });

  it("denies a user without approve_outside_calls at all", async () => {
    expect(await requestOutsideCallApproval({ userId: "malachi", agent: "assistant" }, "a photo", false)).toBe(false);
  });

  it("allows non-sensitive data for a user with approve_outside_calls", async () => {
    expect(await requestOutsideCallApproval({ userId: "vee-basic", agent: "assistant" }, "a photo", false)).toBe(true);
  });

  it("denies sensitive data for a user who has approve_outside_calls but not the sensitive gate", async () => {
    expect(await requestOutsideCallApproval({ userId: "vee-basic", agent: "assistant" }, "medical record", true)).toBe(false);
  });

  it("allows sensitive data only when both gates are held", async () => {
    expect(await requestOutsideCallApproval({ userId: "vee-full", agent: "assistant" }, "medical record", true)).toBe(true);
  });

  it("Malachi's account (a minor) has no path to the sensitive gate, matching AI_Permissions.md", async () => {
    // Not just off-by-default — this account was never granted either gate at
    // seed time, mirroring "cannot be granted to a minor at all." Actually
    // preventing the grant itself is Phase 4 Administration UI work, not
    // built yet — this test only proves the check-side enforcement holds.
    expect(await requestOutsideCallApproval({ userId: "malachi", agent: "assistant" }, "medical record", true)).toBe(false);
  });
});

describe("isAiEnabledForUser", () => {
  it("is true by default for an adult account", async () => {
    expect(await isAiEnabledForUser("dad")).toBe(true);
  });

  it("reflects ai_enabled = 0", async () => {
    expect(await isAiEnabledForUser("malachi")).toBe(false);
  });
});
