process.env.DATABASE_PATH = ":memory:";
// No VAPID keys configured in this test — createNotification must not throw
// or block on push delivery when a user simply has no subscriptions.

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { createNotification, getRecentNotifications } from "./index";

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
});

describe("createNotification", () => {
  it("stores the notification and it comes back most-recent-first", async () => {
    await createNotification({ userId: "dad", text: "First" });
    await new Promise((r) => setTimeout(r, 5));
    await createNotification({ userId: "dad", text: "Second", severity: "urgent" });

    const recent = getRecentNotifications("dad");
    expect(recent[0]!.text).toBe("Second");
    expect(recent[0]!.severity).toBe("urgent");
    expect(recent[1]!.text).toBe("First");
  });

  it("hard-caps at the last 10, deleting older ones entirely rather than archiving", async () => {
    for (let i = 0; i < 15; i++) {
      await createNotification({ userId: "dad", text: `Notification ${i}` });
    }

    const recent = getRecentNotifications("dad");
    expect(recent.length).toBe(10);
    expect(recent[0]!.text).toBe("Notification 14");

    const total = getDb().prepare(`SELECT COUNT(*) c FROM notifications WHERE user_id = 'dad'`).get() as { c: number };
    expect(total.c).toBe(10);
  });

  it("does not throw when the user has no push subscriptions and VAPID isn't configured", async () => {
    await expect(createNotification({ userId: "dad", text: "No subscribers yet" })).resolves.toBeDefined();
  });
});
