process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { POST } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../../../db/schema.sql"), "utf8"));
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

function makeSchoolYear(): string {
  const id = randomUUID();
  getDb()
    .prepare(`INSERT INTO school_years (id, child_id, start_date, end_date, created_by) VALUES (?, 'malachi', '2026-09-01', '2027-06-01', 'vee')`)
    .run(id);
  return id;
}

function postReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/homeschool/school-year/x/blackouts", {
    method: "POST",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/homeschool/school-year/[id]/blackouts", () => {
  it("requires authentication", async () => {
    const id = makeSchoolYear();
    const res = await POST(postReq(null, { label: "Winter Break", startDate: "2026-12-20", endDate: "2027-01-05" }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(401);
  });

  it("404s for an unknown school year", async () => {
    const res = await POST(postReq("vee", { label: "x", startDate: "2026-12-20", endDate: "2027-01-05" }), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a user with no admin authority over the child", async () => {
    const id = makeSchoolYear();
    const res = await POST(postReq("malachi", { label: "x", startDate: "2026-12-20", endDate: "2027-01-05" }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(403);
  });

  it("adds a blackout range", async () => {
    const id = makeSchoolYear();
    const res = await POST(
      postReq("vee", { label: "Winter Break", startDate: "2026-12-20", endDate: "2027-01-05" }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.label).toBe("Winter Break");
    const count = (getDb().prepare(`SELECT COUNT(*) AS c FROM school_year_blackouts WHERE school_year_id = ?`).get(id) as { c: number }).c;
    expect(count).toBe(1);
  });
});
