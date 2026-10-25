process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { PATCH } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('grandma', 'grandma.viewer', 'x', 'Grandma', 'external_viewer')`
  ).run();
});

function patchReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/admin/external-viewers/grandma", {
    method: "PATCH",
    headers: { ...(userId ? { "x-user-id": userId } : {}), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function eventsOfType(type: string) {
  return getDb().prepare(`SELECT user_id, detail FROM security_events WHERE type = ?`).all(type) as {
    user_id: string;
    detail: string;
  }[];
}

describe("PATCH /api/admin/external-viewers/[id]", () => {
  it("logs password_reset (not permission_changed) for a password-only change", async () => {
    const res = await PATCH(patchReq("dad", { newPassword: "new-password-123" }), idParams("grandma"));
    expect(res.status).toBe(200);

    const resetEvents = eventsOfType("password_reset");
    expect(resetEvents.length).toBe(1);
    expect(resetEvents[0]!.user_id).toBe("dad");
    expect(JSON.parse(resetEvents[0]!.detail).targetUserId).toBe("grandma");

    // A bare password change alone shouldn't also produce a permission_changed row.
    expect(eventsOfType("permission_changed").length).toBe(0);
  });

  it("logs both permission_changed and password_reset when a single PATCH changes board access and password", async () => {
    const res = await PATCH(
      patchReq("dad", { boardAccess: true, newPassword: "another-new-password" }),
      idParams("grandma")
    );
    expect(res.status).toBe(200);

    expect(eventsOfType("password_reset").length).toBe(2); // 1 from the prior test + 1 here
    const permChanged = eventsOfType("permission_changed");
    expect(permChanged.length).toBe(1);
    expect(JSON.parse(permChanged[0]!.detail).boardAccess).toBe(true);
  });

  it("still logs permission_changed for a bare board-access change with no password change", async () => {
    const res = await PATCH(patchReq("dad", { boardAccess: false }), idParams("grandma"));
    expect(res.status).toBe(200);
    expect(eventsOfType("permission_changed").length).toBe(2);
  });
});
