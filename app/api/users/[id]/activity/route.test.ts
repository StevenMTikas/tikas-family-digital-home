// view_child_activity_logs finally has something to exercise (Authorization.md).
// The permission matrix is the point: Super Admin always; an Admin only for a
// child in their scope AND only if individually granted the permission; never
// a Basic User, never your own activity, and the event allowlist keeps
// private AI conversations out.

process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { getViewableActivityTargets } from "@/lib/core/logging/activity";
import { getAuthUser } from "@/lib/core/permissions";

const { GET } = await import("./route");

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../../db/schema.sql"), "utf8"));
  const insert = db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, admin_scope, view_child_activity_logs)
     VALUES (?, ?, 'x', ?, ?, ?, ?)`
  );
  insert.run("dad", "dad.test", "Dad", "super_admin", null, 0);
  insert.run("vee", "vee.test", "Vee", "admin", JSON.stringify(["malachi"]), 1);
  insert.run("vee-nogrant", "vee2.test", "Vee Two", "admin", JSON.stringify(["malachi"]), 0);
  insert.run("other-admin", "oa.test", "Other Admin", "admin", JSON.stringify(["someone-else"]), 1);
  insert.run("malachi", "malachi.test", "Malachi", "basic_user", null, 0);
  insert.run("someone-else", "se.test", "Someone Else", "basic_user", null, 0);

  const event = db.prepare(`INSERT INTO security_events (id, type, user_id, detail, created_at) VALUES (?, ?, ?, ?, ?)`);
  event.run("e1", "login", "malachi", null, "2026-10-20 14:00:00");
  event.run("e2", "document_downloaded", "malachi", JSON.stringify({ documentId: "d1", title: "Report Card" }), "2026-10-21 15:30:00");
  event.run("e3", "outside_call_blocked", "malachi", JSON.stringify({ payloadDescription: "a photo", reason: "missing approve_outside_calls permission" }), "2026-10-22 09:00:00");
  // Must never appear: AI conversations stay private, and device events are logged against the acting Admin.
  event.run("e4", "ai_interaction", "malachi", JSON.stringify({ conversationId: "c1" }), "2026-10-22 10:00:00");
  event.run("e5", "device_added", "malachi", JSON.stringify({ deviceName: "Phone" }), "2026-10-22 11:00:00");
  event.run("e6", "login", "someone-else", null, "2026-10-22 12:00:00");
});

function req(userId: string | null) {
  return new NextRequest("http://localhost/api/users/x/activity", { headers: { "x-user-id": userId ?? "" } });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/users/[id]/activity", () => {
  it("requires authentication", async () => {
    expect((await GET(req(null), params("malachi"))).status).toBe(401);
  });

  it("lets an Admin with the permission see a scoped child's activity, newest first", async () => {
    const res = await GET(req("vee"), params("malachi"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; label: string; summary: string | null; createdAt: string }[];
    expect(body.map((e) => e.type)).toEqual(["outside_call_blocked", "document_downloaded", "login"]);
    expect(body[1]).toMatchObject({ label: "Downloaded a document", summary: "Report Card" });
    expect(body[2]?.createdAt).toBe("2026-10-20T14:00:00Z");
  });

  it("never exposes AI conversations or device events", async () => {
    const body = (await (await GET(req("dad"), params("malachi"))).json()) as { type: string }[];
    expect(body.some((e) => e.type === "ai_interaction" || e.type === "device_added")).toBe(false);
  });

  it("lets the Super Admin see anyone's activity", async () => {
    expect((await GET(req("dad"), params("someone-else"))).status).toBe(200);
  });

  it("forbids an Admin who lacks the individually grantable permission, even over their own child", async () => {
    expect((await GET(req("vee-nogrant"), params("malachi"))).status).toBe(403);
  });

  it("forbids an Admin with the permission over someone outside their scope", async () => {
    expect((await GET(req("vee"), params("someone-else"))).status).toBe(403);
  });

  it("forbids a Basic User from seeing another user's activity", async () => {
    expect((await GET(req("malachi"), params("someone-else"))).status).toBe(403);
  });

  it("forbids viewing your own activity through this oversight route", async () => {
    expect((await GET(req("vee"), params("vee"))).status).toBe(403);
  });
});

describe("getViewableActivityTargets", () => {
  it("is everyone but yourself for the Super Admin", async () => {
    const dad = (await getAuthUser("dad"))!;
    expect(getViewableActivityTargets(dad).map((t) => t.id).sort()).toEqual(
      ["malachi", "other-admin", "someone-else", "vee", "vee-nogrant"]
    );
  });

  it("is the scoped children only, and only with the permission", async () => {
    expect(getViewableActivityTargets((await getAuthUser("vee"))!).map((t) => t.id)).toEqual(["malachi"]);
    expect(getViewableActivityTargets((await getAuthUser("vee-nogrant"))!)).toEqual([]);
    expect(getViewableActivityTargets((await getAuthUser("malachi"))!)).toEqual([]);
  });
});
