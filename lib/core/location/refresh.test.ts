process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { requestLocationRefresh, STALE_AFTER_MS, MIN_PUSH_GAP_MS } from "./refresh";
import { recordLocationReport, savePushToken, getCurrentFamilyLocations } from "./index";
import type { PushSender, PushResult } from "./fcm";

const NOW = new Date("2026-10-25T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

interface Sent {
  token: string;
  data: Record<string, string>;
}

function makeSender(result: PushResult = "sent"): { send: PushSender; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    send: async (token, data) => {
      sent.push({ token, data });
      return result;
    },
  };
}

function addReport(userId: string, recordedAt: string) {
  getDb()
    .prepare(`INSERT INTO location_reports (id, user_id, device_id, latitude, longitude, recorded_at) VALUES (?, ?, ?, 1, 1, ?)`)
    .run(`r-${Math.random()}`, userId, `${userId}-phone`, recordedAt);
}

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);

  const addUser = db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`);
  addUser.run("dad", "dad.t", "Dad", "super_admin");
  addUser.run("vee", "vee.t", "Vee", "admin");
  addUser.run("malachi", "mal.t", "Malachi", "basic_user");
  addUser.run("grandma", "gma.t", "Grandma", "external_viewer");

  const addDevice = db.prepare(`INSERT INTO devices (id, user_id, device_type, device_name, added_by) VALUES (?, ?, 'phone', 'Phone', 'dad')`);
  for (const u of ["dad", "vee", "malachi", "grandma"]) addDevice.run(`${u}-phone`, u);
});

beforeEach(() => {
  const db = getDb();
  db.prepare(`DELETE FROM location_reports`).run();
  db.prepare(`UPDATE devices SET push_token = NULL, last_refresh_push_at = NULL`).run();
  db.prepare(`UPDATE users SET location_sharing_enabled = 1`).run();
  for (const u of ["dad", "vee", "malachi", "grandma"]) savePushToken(`${u}-phone`, `token-${u}-0123456789abcdef`);
});

describe("requestLocationRefresh", () => {
  it("pushes to every sharing family member whose reading is stale or missing", async () => {
    addReport("dad", ago(STALE_AFTER_MS + 1000)); // stale
    addReport("vee", ago(10_000)); // fresh
    // malachi: no reading at all

    const { send, sent } = makeSender();
    const result = await requestLocationRefresh({}, { send, now: NOW });

    expect(result.configured).toBe(true);
    expect(result.requested.sort()).toEqual(["dad", "malachi"]);
    expect(sent.map((s) => s.token).sort()).toEqual(["token-dad-0123456789abcdef", "token-malachi-0123456789abcdef"]);
  });

  it("never pushes to an external viewer", async () => {
    const { send, sent } = makeSender();
    await requestLocationRefresh({ force: true }, { send, now: NOW });
    expect(sent.some((s) => s.token.includes("grandma"))).toBe(false);
  });

  it("never pushes for someone who turned location sharing off — even when forced", async () => {
    getDb().prepare(`UPDATE users SET location_sharing_enabled = 0 WHERE id = 'vee'`).run();
    const { send, sent } = makeSender();
    const result = await requestLocationRefresh({ onlyUserId: "vee", force: true }, { send, now: NOW });
    expect(sent).toHaveLength(0);
    expect(result.requested).toEqual([]);
  });

  it("a manual refresh (force) skips the staleness check", async () => {
    addReport("dad", ago(5_000)); // fresh
    const { send, sent } = makeSender();

    expect((await requestLocationRefresh({ onlyUserId: "dad" }, { send, now: NOW })).requested).toEqual([]);
    expect(sent).toHaveLength(0);

    const forced = await requestLocationRefresh({ onlyUserId: "dad", force: true }, { send, now: NOW });
    expect(forced.requested).toEqual(["dad"]);
    expect(sent).toHaveLength(1);
  });

  it("onlyUserId restricts the push to that person", async () => {
    const { send, sent } = makeSender();
    await requestLocationRefresh({ onlyUserId: "malachi", force: true }, { send, now: NOW });
    expect(sent.map((s) => s.token)).toEqual(["token-malachi-0123456789abcdef"]);
  });

  it("rate-limits to one push per phone per window, however often it's requested", async () => {
    const { send, sent } = makeSender();
    await requestLocationRefresh({ onlyUserId: "dad", force: true }, { send, now: NOW });
    await requestLocationRefresh({ onlyUserId: "dad", force: true }, { send, now: new Date(NOW.getTime() + MIN_PUSH_GAP_MS - 1000) });
    expect(sent).toHaveLength(1);

    await requestLocationRefresh({ onlyUserId: "dad", force: true }, { send, now: new Date(NOW.getTime() + MIN_PUSH_GAP_MS + 1000) });
    expect(sent).toHaveLength(2);
  });

  it("skips a phone that hasn't registered a push token", async () => {
    getDb().prepare(`UPDATE devices SET push_token = NULL WHERE id = 'dad-phone'`).run();
    const { send, sent } = makeSender();
    const result = await requestLocationRefresh({ onlyUserId: "dad", force: true }, { send, now: NOW });
    expect(sent).toHaveLength(0);
    expect(result.requested).toEqual([]);
  });

  it("forgets a token FCM says is dead, so it isn't pushed to again", async () => {
    const { send } = makeSender("invalid_token");
    const result = await requestLocationRefresh({ onlyUserId: "dad", force: true }, { send, now: NOW });
    expect(result.requested).toEqual([]);

    const row = getDb().prepare(`SELECT push_token FROM devices WHERE id = 'dad-phone'`).get() as { push_token: string | null };
    expect(row.push_token).toBeNull();
  });

  it("a failed send doesn't start the rate-limit window or mark the user as requested", async () => {
    const { send } = makeSender("error");
    const result = await requestLocationRefresh({ onlyUserId: "dad", force: true }, { send, now: NOW });
    expect(result.requested).toEqual([]);

    const row = getDb().prepare(`SELECT last_refresh_push_at, push_token FROM devices WHERE id = 'dad-phone'`).get() as {
      last_refresh_push_at: string | null;
      push_token: string | null;
    };
    expect(row.last_refresh_push_at).toBeNull();
    expect(row.push_token).not.toBeNull(); // a transient error says nothing about the token
  });

  it("the push payload carries no location data — only a report-now signal", async () => {
    addReport("dad", ago(STALE_AFTER_MS + 1000));
    const { send, sent } = makeSender();
    await requestLocationRefresh({ onlyUserId: "dad" }, { send, now: NOW });

    expect(Object.keys(sent[0]!.data).sort()).toEqual(["nonce", "sentAt", "type"]);
    expect(sent[0]!.data.type).toBe("location_refresh");
  });
});

describe("report source + push token storage", () => {
  it("stores the source tag with a reading and returns it with the current location", () => {
    recordLocationReport(
      { id: "dad-phone", userId: "dad", deviceType: "phone", designatedFolders: [] },
      { latitude: 5, longitude: 6, recordedAt: ago(1000), source: "push_refresh" }
    );
    const dad = getCurrentFamilyLocations().find((l) => l.userId === "dad")!;
    expect(dad.source).toBe("push_refresh");
  });

  it("leaves source null when an older connector build doesn't send one", () => {
    recordLocationReport(
      { id: "vee-phone", userId: "vee", deviceType: "phone", designatedFolders: [] },
      { latitude: 5, longitude: 6, recordedAt: ago(1000) }
    );
    expect(getCurrentFamilyLocations().find((l) => l.userId === "vee")!.source).toBeNull();
  });

  it("the database refuses an unknown source value", () => {
    expect(() =>
      getDb()
        .prepare(`INSERT INTO location_reports (id, user_id, device_id, latitude, longitude, recorded_at, source) VALUES ('x','dad','dad-phone',1,1,'t','bogus')`)
        .run()
    ).toThrow();
  });
});
