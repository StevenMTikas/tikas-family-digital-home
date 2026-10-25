process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { GET, POST } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, admin_scope) VALUES ('vee', 'vee.test', 'x', 'Vee', 'admin', '["malachi"]')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user')`
  ).run();
});

beforeEach(() => {
  getDb().exec(`DELETE FROM school_year_blackouts; DELETE FROM school_years;`);
});

function getReq(userId: string | null, childId: string) {
  return new NextRequest(`http://localhost/api/homeschool/school-year?childId=${childId}`, {
    headers: userId ? { "x-user-id": userId } : {},
  });
}

function postReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/homeschool/school-year", {
    method: "POST",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/homeschool/school-year", () => {
  it("requires authentication", async () => {
    const res = await GET(getReq(null, "malachi"));
    expect(res.status).toBe(401);
  });

  it("rejects a user with no admin authority over the child", async () => {
    const res = await GET(getReq("malachi", "malachi"));
    // Malachi has no admin authority over himself (basic_user, not admin/super_admin)
    expect(res.status).toBe(403);
  });

  it("returns null when no school year is set yet", async () => {
    const res = await GET(getReq("vee", "malachi"));
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });
});

describe("POST /api/homeschool/school-year", () => {
  it("rejects an Admin not scoped to this child", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO users (id, username, password_hash, full_name, role, admin_scope) VALUES ('other_admin', 'other.test', 'x', 'Other', 'admin', '[]')`
    ).run();
    const res = await POST(postReq("other_admin", { childId: "malachi", startDate: "2026-09-01", endDate: "2027-06-01" }));
    expect(res.status).toBe(403);
  });

  it("rejects an end date before the start date", async () => {
    const res = await POST(postReq("vee", { childId: "malachi", startDate: "2027-06-01", endDate: "2026-09-01" }));
    expect(res.status).toBe(400);
  });

  it("creates a school year for Vee's scoped child", async () => {
    const res = await POST(postReq("vee", { childId: "malachi", startDate: "2026-09-01", endDate: "2027-06-01" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.startDate).toBe("2026-09-01");
    expect(body.endDate).toBe("2027-06-01");
    expect(body.blackouts).toEqual([]);
  });

  it("updates the existing school year in place rather than creating a second one", async () => {
    await POST(postReq("vee", { childId: "malachi", startDate: "2026-09-01", endDate: "2027-06-01" }));
    const res = await POST(postReq("vee", { childId: "malachi", startDate: "2026-09-05", endDate: "2027-06-05" }));
    expect(res.status).toBe(200);
    const count = (getDb().prepare(`SELECT COUNT(*) AS c FROM school_years WHERE child_id = 'malachi'`).get() as { c: number }).c;
    expect(count).toBe(1);
  });
});
