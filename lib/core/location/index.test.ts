process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import {
  recordLocationReport,
  getCurrentFamilyLocations,
  getLocationHistory,
  purgeOldLocationReports,
  isMinor,
  getLocationSharingEnabled,
  setLocationSharingEnabled,
} from "./index";
import type { AuthUser } from "@/lib/core/permissions";

const NOW = new Date("2026-08-23T12:00:00Z");
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function makeActor(id: string): AuthUser {
  return {
    id,
    role: "basic_user",
    adminScope: [],
    permissions: {
      approveOutsideCalls: false,
      manageDevices: false,
      manageParentalControls: false,
      viewChildActivityLogs: false,
      deleteContent: false,
      manageFolderPermissions: false,
      approveSensitiveOutsideTransmission: false,
      viewFamilyBoard: false,
    },
  };
}

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);

  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, date_of_birth) VALUES (?, ?, 'x', ?, 'basic_user', ?)`
  ).run("dad", "dad.test", "Dad", "1980-01-01");
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, date_of_birth) VALUES (?, ?, 'x', ?, 'basic_user', ?)`
  ).run("malachi", "malachi.test", "Malachi", "2012-01-01"); // a minor as of NOW
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, location_sharing_enabled) VALUES (?, ?, 'x', ?, 'basic_user', 0)`
  ).run("vee", "vee.test", "Vee");

  db.prepare(`INSERT INTO devices (id, user_id, device_type, device_name, added_by) VALUES (?, ?, 'phone', 'Dad Phone', 'dad')`).run(
    "dad-phone",
    "dad"
  );
  db.prepare(`INSERT INTO devices (id, user_id, device_type, device_name, added_by) VALUES (?, ?, 'phone', 'Malachi Phone', 'dad')`).run(
    "malachi-phone",
    "malachi"
  );

  db.prepare(
    `INSERT INTO location_reports (id, user_id, device_id, latitude, longitude, recorded_at, received_at) VALUES (?, 'dad', 'dad-phone', 1, 1, ?, ?)`
  ).run("old-1", daysAgo(8), daysAgo(8));
  db.prepare(
    `INSERT INTO location_reports (id, user_id, device_id, latitude, longitude, recorded_at, received_at) VALUES (?, 'dad', 'dad-phone', 2, 2, ?, ?)`
  ).run("recent-1", daysAgo(1), daysAgo(1));
  db.prepare(
    `INSERT INTO location_reports (id, user_id, device_id, latitude, longitude, recorded_at, received_at) VALUES (?, 'dad', 'dad-phone', 3, 3, ?, ?)`
  ).run("latest", daysAgo(0.01), daysAgo(0.01));
});

describe("getCurrentFamilyLocations", () => {
  it("returns the latest reading per user, excluding anyone with sharing disabled", () => {
    const locations = getCurrentFamilyLocations();
    const userIds = locations.map((l) => l.userId);
    expect(userIds).toContain("dad");
    expect(userIds).not.toContain("vee"); // sharing disabled

    const dad = locations.find((l) => l.userId === "dad")!;
    expect(dad.latitude).toBe(3); // the most recent of dad's three readings
  });
});

describe("getLocationHistory", () => {
  it("returns all readings for a user, most recent first", () => {
    const history = getLocationHistory("dad");
    expect(history).toHaveLength(3);
    expect(history[0]!.latitude).toBe(3);
  });
});

describe("purgeOldLocationReports", () => {
  it("deletes reports past the 7-day window and keeps recent ones", () => {
    const deleted = purgeOldLocationReports(NOW);
    expect(deleted).toBe(1);

    const remainingIds = (getDb().prepare(`SELECT id FROM location_reports`).all() as { id: string }[]).map((r) => r.id);
    expect(remainingIds).not.toContain("old-1");
    expect(remainingIds).toContain("recent-1");
    expect(remainingIds).toContain("latest");
  });
});

describe("isMinor", () => {
  it("treats someone under 18 as a minor", () => {
    expect(isMinor("2012-01-01", NOW)).toBe(true);
  });

  it("treats someone 18+ as not a minor", () => {
    expect(isMinor("1980-01-01", NOW)).toBe(false);
  });

  it("treats a null date of birth as not a minor", () => {
    expect(isMinor(null, NOW)).toBe(false);
  });
});

describe("setLocationSharingEnabled", () => {
  it("lets an adult turn sharing off", () => {
    const err = setLocationSharingEnabled(makeActor("dad"), false);
    expect(err).toBeNull();
    expect(getLocationSharingEnabled("dad")).toBe(false);
  });

  it("refuses to let a minor turn sharing off", () => {
    const err = setLocationSharingEnabled(makeActor("malachi"), false);
    expect(err).toBe("minor_cannot_opt_out");
    expect(getLocationSharingEnabled("malachi")).toBe(true);
  });
});

describe("recordLocationReport", () => {
  it("inserts a new report for the reporting device's user", () => {
    const before = getLocationHistory("malachi").length;
    recordLocationReport(
      { id: "malachi-phone", userId: "malachi", deviceType: "phone", designatedFolders: [] },
      { latitude: 10, longitude: 20, recordedAt: NOW.toISOString() }
    );
    expect(getLocationHistory("malachi")).toHaveLength(before + 1);
  });
});
