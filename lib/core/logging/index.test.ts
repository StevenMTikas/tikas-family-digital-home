process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { purgeOldSecurityEvents } from "./index";

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

  db.prepare(`INSERT INTO security_events (id, type, user_id, created_at) VALUES (?, 'login', 'dad', ?)`).run(
    "old-1",
    daysAgo(31)
  );
  db.prepare(`INSERT INTO security_events (id, type, user_id, created_at) VALUES (?, 'login', 'dad', ?)`).run(
    "boundary",
    daysAgo(30)
  );
  db.prepare(`INSERT INTO security_events (id, type, user_id, created_at) VALUES (?, 'login', 'dad', ?)`).run(
    "recent-1",
    daysAgo(1)
  );
});

describe("purgeOldSecurityEvents", () => {
  it("deletes events past the 30-day retention window and keeps recent ones", async () => {
    const deleted = await purgeOldSecurityEvents(NOW);
    expect(deleted).toBe(1);

    const remainingIds = (getDb().prepare(`SELECT id FROM security_events`).all() as { id: string }[]).map(
      (r) => r.id
    );
    expect(remainingIds).not.toContain("old-1");
    expect(remainingIds).toContain("boundary");
    expect(remainingIds).toContain("recent-1");
  });
});
