process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { POST } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, delete_content) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin', 0)`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, delete_content) VALUES ('vee', 'vee.test', 'x', 'Vee', 'admin', 1)`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, delete_content) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user', 0)`
  ).run();
  db.prepare(
    `INSERT INTO devices (id, user_id, device_type, device_name, added_by) VALUES ('device-1', 'dad', 'computer', ?, 'dad')`
  ).run("Dad's PC");
});

function insertPhoto(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? randomUUID();
  getDb()
    .prepare(
      `INSERT INTO photos (id, file, uploaded_by, source_device_id, source_path)
       VALUES (@id, @file, @uploaded_by, @source_device_id, @source_path)`
    )
    .run({
      id,
      file: "does-not-exist-on-disk.jpg",
      uploaded_by: "dad",
      source_device_id: "device-1",
      source_path: "/DCIM/Camera/IMG_0001.jpg",
      ...overrides,
    });
  return id;
}

function excludeReq(userId: string | null) {
  return new NextRequest("http://localhost/api/photos/x/exclude", {
    method: "POST",
    headers: userId ? { "x-user-id": userId } : {},
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/photos/[id]/exclude", () => {
  it("requires authentication", async () => {
    const id = insertPhoto();
    const res = await POST(excludeReq(null), idParams(id));
    expect(res.status).toBe(401);
  });

  it("404s for a nonexistent photo", async () => {
    const res = await POST(excludeReq("dad"), idParams(randomUUID()));
    expect(res.status).toBe(404);
  });

  it("forbids a user without the deleteContent permission — even the photo's own uploader", async () => {
    const id = insertPhoto({ uploaded_by: "malachi" });
    const res = await POST(excludeReq("malachi"), idParams(id));
    expect(res.status).toBe(403);
  });

  it("allows a user with deleteContent even if they didn't upload it", async () => {
    const id = insertPhoto({ uploaded_by: "dad" });
    const res = await POST(excludeReq("vee"), idParams(id));
    expect(res.status).toBe(204);
  });

  it("rejects excluding a photo with no source_device_id/source_path (never synced from a connector)", async () => {
    const id = insertPhoto({ source_device_id: null, source_path: null });
    const res = await POST(excludeReq("vee"), idParams(id));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_STATE");
  });

  it("excludes: records the exclusion, deletes the row, and removes it from search", async () => {
    const db = getDb();
    const id = insertPhoto();
    const dummyEmbedding = Buffer.from(new Float32Array(768).buffer);
    db.prepare(`INSERT INTO vec_content (content_key, embedding) VALUES (?, ?)`).run(`photo:${id}`, dummyEmbedding);

    const res = await POST(excludeReq("vee"), idParams(id));
    expect(res.status).toBe(204);

    expect(db.prepare(`SELECT * FROM photos WHERE id = ?`).get(id)).toBeUndefined();
    expect(
      db.prepare(`SELECT * FROM connector_exclusions WHERE device_id = ? AND source_path = ?`).get(
        "device-1",
        "/DCIM/Camera/IMG_0001.jpg"
      )
    ).toBeTruthy();
    expect(db.prepare(`SELECT COUNT(*) as n FROM vec_content WHERE content_key = ?`).get(`photo:${id}`)).toEqual({
      n: 0,
    });
  });

  it("does not check folder access at all — unlike documents' exclude, this checks the deleteContent permission only", async () => {
    // Regression-style test making the divergence from documents' exclude route
    // explicit: photos never gate on folder access (canAccessFolder), only on
    // the deleteContent permission, even though photos do have a folder_id
    // (the auto-filed default Photos folder for external_viewer grants).
    const id = insertPhoto({ folder_id: "some-folder-vee-has-no-grant-on" });
    const res = await POST(excludeReq("vee"), idParams(id));
    expect(res.status).toBe(204);
  });
});
