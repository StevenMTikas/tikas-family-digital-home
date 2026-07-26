process.env.DATABASE_PATH = ":memory:";
// Isolates computeHealthSnapshot's backup check from whatever real backups
// happen to exist on disk under the project's actual backups/ directory.
process.env.BACKUP_DIR = "/tmp/tikas-guardian-test-backups-does-not-exist";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { detectGuardianFindings, computeHealthSnapshot, getLatestHealthSnapshot } from "./guardian";

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

describe("computeHealthSnapshot", () => {
  it("reports device connectivity as an issue when a device is stale", async () => {
    const snapshot = await computeHealthSnapshot(NOW);
    expect(snapshot.deviceConnectivity.status).toBe("issue");
    expect(snapshot.deviceConnectivity.staleDeviceCount).toBe(1);
  });

  it("reports backup as unknown when no backup has ever run", async () => {
    const snapshot = await computeHealthSnapshot(NOW);
    expect(snapshot.backup.status).toBe("unknown");
    expect(snapshot.backup.lastBackupAt).toBeNull();
  });
});

describe("getLatestHealthSnapshot", () => {
  it("falls back to a live computation with no checkedAt when Guardian has never run", async () => {
    const { checkedAt, health } = await getLatestHealthSnapshot();
    expect(checkedAt).toBeNull();
    expect(health.deviceConnectivity.status).toBe("issue");
  });

  it("reads back a previously logged snapshot verbatim, with its timestamp", async () => {
    const db = getDb();
    const loggedHealth = { diskSpace: { status: "ok", freeRatio: 0.5 }, deviceConnectivity: { status: "ok", staleDeviceCount: 0 }, backup: { status: "ok", lastBackupAt: "2026-07-24T00:00:00.000Z", lastBackupStatus: "success" } };
    db.prepare(`INSERT INTO security_events (id, type, user_id, detail, created_at) VALUES (?, 'ai_interaction', NULL, ?, ?)`).run(
      "guardian-run-1",
      JSON.stringify({ agent: "guardian", health: loggedHealth }),
      "2026-07-25T06:00:00.000Z"
    );

    const { checkedAt, health } = await getLatestHealthSnapshot();
    expect(checkedAt).toBe("2026-07-25T06:00:00.000Z");
    expect(health).toEqual(loggedHealth);
  });
});
