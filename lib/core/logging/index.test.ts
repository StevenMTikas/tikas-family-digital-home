process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { purgeOldSecurityEvents, LOG_EVENT_TYPES } from "./index";

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

describe("admin Logs screen stays in sync with LogEventType", () => {
  // Guards against the exact bug found 2026-08-25: logout/login_locked were
  // real, emitted event types but missing from AdministrationPageClient.tsx's
  // hand-maintained EVENT_TYPE_LABELS map, so they rendered as a raw string
  // and couldn't be selected in the type filter at all. That map is a plain
  // Record<string, string> (not Record<LogEventType, string>), so TypeScript
  // itself won't catch a missing key — this reads the component's source
  // text directly rather than importing it, since the component is a "use
  // client" React file this Node-environment test suite isn't set up to render.
  it("has an EVENT_TYPE_LABELS entry for every LogEventType", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../app/administration/AdministrationPageClient.tsx"),
      "utf8"
    );
    const match = source.match(/const EVENT_TYPE_LABELS: Record<string, string> = \{([\s\S]*?)\n\};/);
    expect(match, "EVENT_TYPE_LABELS block not found — did it move or get renamed?").toBeTruthy();
    const labelsBlock = match![1];

    for (const type of LOG_EVENT_TYPES) {
      expect(labelsBlock, `EVENT_TYPE_LABELS is missing an entry for "${type}"`).toMatch(
        new RegExp(`(^|\\s)${type}:`)
      );
    }
  });
});
