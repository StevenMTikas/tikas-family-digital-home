process.env.DATABASE_PATH = ":memory:";
process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";

const sendNotification = vi.fn();
const setVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

const { saveSubscription, removeSubscription, sendPushToUser } = await import("./index");

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
    "vee",
    "vee.test",
    "Vee",
    "admin"
  );
});

describe("saveSubscription", () => {
  it("inserts a new subscription for a new endpoint", () => {
    saveSubscription("dad", { endpoint: "https://push.example/a", keys: { p256dh: "p1", auth: "a1" } });
    const row = getDb().prepare(`SELECT user_id, p256dh, auth FROM push_subscriptions WHERE endpoint = ?`).get("https://push.example/a") as {
      user_id: string;
      p256dh: string;
      auth: string;
    };
    expect(row.user_id).toBe("dad");
    expect(row.p256dh).toBe("p1");
  });

  it("upserts by endpoint — resubscribing replaces keys rather than duplicating the row", () => {
    saveSubscription("dad", { endpoint: "https://push.example/b", keys: { p256dh: "old", auth: "old" } });
    saveSubscription("dad", { endpoint: "https://push.example/b", keys: { p256dh: "new", auth: "new" } });

    const rows = getDb().prepare(`SELECT p256dh FROM push_subscriptions WHERE endpoint = ?`).all("https://push.example/b") as {
      p256dh: string;
    }[];
    expect(rows.length).toBe(1);
    expect(rows[0]!.p256dh).toBe("new");
  });
});

describe("removeSubscription", () => {
  it("deletes the row for the given endpoint", () => {
    saveSubscription("dad", { endpoint: "https://push.example/c", keys: { p256dh: "p", auth: "a" } });
    removeSubscription("https://push.example/c");
    const row = getDb().prepare(`SELECT id FROM push_subscriptions WHERE endpoint = ?`).get("https://push.example/c");
    expect(row).toBeUndefined();
  });
});

describe("sendPushToUser", () => {
  it("is a no-op when the user has no subscriptions — doesn't require VAPID config at all", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    await expect(
      sendPushToUser("someone-with-no-subscriptions", { id: "n1", text: "hi", severity: "routine" })
    ).resolves.toBeUndefined();
    expect(sendNotification).not.toHaveBeenCalled();
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
  });

  it("sends to every subscription this user has", async () => {
    sendNotification.mockClear();
    sendNotification.mockResolvedValue(undefined);
    // A fresh user (not "dad", which accumulates subscriptions across
    // earlier tests in this file) so the call count below is exact.
    saveSubscription("vee", { endpoint: "https://push.example/d1", keys: { p256dh: "p", auth: "a" } });
    saveSubscription("vee", { endpoint: "https://push.example/d2", keys: { p256dh: "p", auth: "a" } });

    await sendPushToUser("vee", { id: "n2", text: "hello", severity: "routine" });

    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("removes a dead subscription (410 Gone) but keeps other subscriptions intact", async () => {
    sendNotification.mockReset();
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === "https://push.example/dead") {
        const err = new Error("gone") as Error & { statusCode: number };
        err.statusCode = 410;
        throw err;
      }
    });

    saveSubscription("dad", { endpoint: "https://push.example/dead", keys: { p256dh: "p", auth: "a" } });
    const beforeCount = (getDb().prepare(`SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = 'dad'`).get() as { c: number }).c;

    await sendPushToUser("dad", { id: "n3", text: "test", severity: "urgent" });

    const afterCount = (getDb().prepare(`SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = 'dad'`).get() as { c: number }).c;
    expect(afterCount).toBe(beforeCount - 1);

    const dead = getDb().prepare(`SELECT id FROM push_subscriptions WHERE endpoint = ?`).get("https://push.example/dead");
    expect(dead).toBeUndefined();
  });

  it("does not remove a subscription on a non-410/404 error (e.g. a transient failure)", async () => {
    sendNotification.mockReset();
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === "https://push.example/flaky") {
        const err = new Error("server error") as Error & { statusCode: number };
        err.statusCode = 500;
        throw err;
      }
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    saveSubscription("dad", { endpoint: "https://push.example/flaky", keys: { p256dh: "p", auth: "a" } });
    await sendPushToUser("dad", { id: "n4", text: "test", severity: "routine" });

    const stillThere = getDb().prepare(`SELECT id FROM push_subscriptions WHERE endpoint = ?`).get("https://push.example/flaky");
    expect(stillThere).toBeDefined();
    consoleSpy.mockRestore();
  });
});
