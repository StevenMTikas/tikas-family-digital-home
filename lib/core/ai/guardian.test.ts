process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { detectGuardianFindings } from "./guardian";

const NOW = new Date("2026-07-25T12:00:00Z");
function daysAgo(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);

  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
    "dad",
    "dad.test",
    "Dad",
    "super_admin"
  );
  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
    "malachi",
    "malachi.test",
    "Malachi",
    "basic_user"
  );

  // Device trusted 10 days ago, never synced -> stale.
  db.prepare(
    `INSERT INTO devices (id, user_id, device_type, device_name, status, added_by, added_at, last_sync_at)
     VALUES (?, 'dad', 'phone', ?, 'trusted', 'dad', ?, NULL)`
  ).run("dev-stale", "Stale Phone", daysAgo(10));
  // Device trusted 2 days ago, never synced -> not stale yet (within grace window).
  db.prepare(
    `INSERT INTO devices (id, user_id, device_type, device_name, status, added_by, added_at, last_sync_at)
     VALUES (?, 'dad', 'phone', ?, 'trusted', 'dad', ?, NULL)`
  ).run("dev-new", "New Phone", daysAgo(2));

  // Two failed logins in the last day.
  db.prepare(`INSERT INTO security_events (id, type, user_id, created_at) VALUES (?, 'login_failed', 'dad', ?)`).run(
    "sec-1",
    daysAgo(0)
  );
  db.prepare(`INSERT INTO security_events (id, type, user_id, created_at) VALUES (?, 'login_failed', 'dad', ?)`).run(
    "sec-2",
    daysAgo(0)
  );

  // Malachi last logged in 10 days ago -> inactive. Dad logged in today -> not inactive.
  db.prepare(`INSERT INTO security_events (id, type, user_id, created_at) VALUES (?, 'login', 'malachi', ?)`).run(
    "sec-3",
    daysAgo(10)
  );
  db.prepare(`INSERT INTO security_events (id, type, user_id, created_at) VALUES (?, 'login', 'dad', ?)`).run(
    "sec-4",
    daysAgo(0)
  );
});

describe("detectGuardianFindings", () => {
  it("flags a device that's never synced well past the grace window", () => {
    const findings = detectGuardianFindings(NOW);
    expect(findings.some((f) => f.rawFinding.includes("Stale Phone"))).toBe(true);
  });

  it("does not flag a recently-added device that hasn't synced yet", () => {
    const findings = detectGuardianFindings(NOW);
    expect(findings.some((f) => f.rawFinding.includes("New Phone"))).toBe(false);
  });

  it("reports the count of failed logins in the last 24 hours", () => {
    const findings = detectGuardianFindings(NOW);
    expect(findings.some((f) => f.rawFinding.includes("2 failed login attempts"))).toBe(true);
  });

  it("flags an account inactive for the threshold, as fact-only (no interpretation)", () => {
    const findings = detectGuardianFindings(NOW);
    const finding = findings.find((f) => f.rawFinding.includes("Malachi"));
    expect(finding).toBeDefined();
    expect(finding!.rawFinding).toBe("Malachi's account hasn't been opened in at least 5 days.");
  });

  it("does not flag an account that logged in recently", () => {
    const findings = detectGuardianFindings(NOW);
    expect(findings.some((f) => f.rawFinding.includes("Dad's account"))).toBe(false);
  });

  it("routes every non-disk finding to the passive channel for MVP", () => {
    const findings = detectGuardianFindings(NOW).filter((f) => !f.rawFinding.includes("Disk space"));
    expect(findings.every((f) => f.channel === "passive")).toBe(true);
  });
});
