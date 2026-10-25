process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
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
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user')`
  ).run();
});

beforeEach(() => {
  getDb().exec(`DELETE FROM curriculum_links; DELETE FROM homework_details; DELETE FROM tasks; DELETE FROM subjects;`);
});

function makeSubject(): string {
  const id = randomUUID();
  getDb().prepare(`INSERT INTO subjects (id, name, created_by) VALUES (?, 'Math', 'dad')`).run(id);
  return id;
}

function getReq(userId: string | null, subjectId: string) {
  return new NextRequest(`http://localhost/api/homeschool/curriculum-links?subjectId=${subjectId}`, {
    headers: userId ? { "x-user-id": userId } : {},
  });
}

function postReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/homeschool/curriculum-links", {
    method: "POST",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/homeschool/curriculum-links", () => {
  it("rejects a Basic User", async () => {
    const subjectId = makeSubject();
    const res = await POST(postReq("malachi", { subjectId, url: "https://example.com/math" }));
    expect(res.status).toBe(403);
  });

  it("rejects an invalid URL", async () => {
    const subjectId = makeSubject();
    const res = await POST(postReq("dad", { subjectId, url: "not-a-url" }));
    expect(res.status).toBe(400);
  });

  it("404s for an unknown subject", async () => {
    const res = await POST(postReq("dad", { subjectId: "ghost", url: "https://example.com" }));
    expect(res.status).toBe(404);
  });

  it("adds a link, and supports more than one per subject", async () => {
    const subjectId = makeSubject();
    const res1 = await POST(postReq("dad", { subjectId, url: "https://example.com/course", label: "Course Site" }));
    expect(res1.status).toBe(201);
    const res2 = await POST(postReq("dad", { subjectId, url: "https://example.com/syllabus.pdf", label: "Syllabus PDF" }));
    expect(res2.status).toBe(201);

    const listRes = await GET(getReq("dad", subjectId));
    const list = await listRes.json();
    expect(list).toHaveLength(2);
  });
});
