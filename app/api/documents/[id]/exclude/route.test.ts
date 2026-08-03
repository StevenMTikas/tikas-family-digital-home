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
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user')`
  ).run();
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, is_shared_family_folder, permissions) VALUES ('viewable-only', 'Viewable', 'dad', 0, ?)`
  ).run(JSON.stringify({ roles: { basic_user: "view" } }));
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, is_shared_family_folder, permissions) VALUES ('deletable', 'Deletable', 'dad', 0, ?)`
  ).run(JSON.stringify({ roles: { basic_user: "delete" } }));
  db.prepare(
    `INSERT INTO devices (id, user_id, device_type, device_name, added_by) VALUES ('device-1', 'dad', 'computer', ?, 'dad')`
  ).run("Dad's PC");
});

function insertDocument(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? randomUUID();
  getDb()
    .prepare(
      `INSERT INTO documents (id, file, title, folder_id, uploaded_by, source_device_id, source_path)
       VALUES (@id, @file, @title, @folder_id, @uploaded_by, @source_device_id, @source_path)`
    )
    .run({
      id,
      file: "does-not-exist-on-disk.pdf",
      title: "Synced Doc",
      folder_id: "deletable",
      uploaded_by: "dad",
      source_device_id: "device-1",
      source_path: "/home/dad/Documents/synced-doc.pdf",
      ...overrides,
    });
  return id;
}

function excludeReq(userId: string | null) {
  return new NextRequest("http://localhost/api/documents/x/exclude", {
    method: "POST",
    headers: userId ? { "x-user-id": userId } : {},
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/documents/[id]/exclude", () => {
  it("requires authentication", async () => {
    const id = insertDocument();
    const res = await POST(excludeReq(null), idParams(id));
    expect(res.status).toBe(401);
  });

  it("404s for a nonexistent document", async () => {
    const res = await POST(excludeReq("dad"), idParams(randomUUID()));
    expect(res.status).toBe(404);
  });

  it("forbids a user with only View (not Delete) access to the folder", async () => {
    const id = insertDocument({ folder_id: "viewable-only" });
    const res = await POST(excludeReq("malachi"), idParams(id));
    expect(res.status).toBe(403);
  });

  it("rejects excluding a document with no source_device_id/source_path (never synced from a connector)", async () => {
    const id = insertDocument({ source_device_id: null, source_path: null });
    const res = await POST(excludeReq("dad"), idParams(id));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_STATE");
  });

  it("excludes: records the exclusion, deletes the row, and removes it from search", async () => {
    const db = getDb();
    const id = insertDocument();
    // Insert a dummy vec_content row directly rather than going through the
    // real indexContent (which calls Ollama for embeddings) — this test only
    // needs to prove removeFromIndex actually runs, not exercise embedding.
    const dummyEmbedding = Buffer.from(new Float32Array(768).buffer);
    db.prepare(`INSERT INTO vec_content (content_key, embedding) VALUES (?, ?)`).run(`document:${id}`, dummyEmbedding);

    const res = await POST(excludeReq("dad"), idParams(id));
    expect(res.status).toBe(204);

    expect(db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id)).toBeUndefined();
    expect(
      db.prepare(`SELECT * FROM connector_exclusions WHERE device_id = ? AND source_path = ?`).get(
        "device-1",
        "/home/dad/Documents/synced-doc.pdf"
      )
    ).toBeTruthy();
    expect(db.prepare(`SELECT COUNT(*) as n FROM vec_content WHERE content_key = ?`).get(`document:${id}`)).toEqual({
      n: 0,
    });
  });

  it("a subsequent exclude of the same device/path is a no-op, not an error (INSERT OR IGNORE)", async () => {
    const db = getDb();
    const first = insertDocument({ source_path: "/home/dad/Documents/dup.pdf" });
    await POST(excludeReq("dad"), idParams(first));

    const second = insertDocument({ source_path: "/home/dad/Documents/dup.pdf" });
    const res = await POST(excludeReq("dad"), idParams(second));
    expect(res.status).toBe(204);

    expect(
      db.prepare(`SELECT COUNT(*) as n FROM connector_exclusions WHERE device_id = ? AND source_path = ?`).get(
        "device-1",
        "/home/dad/Documents/dup.pdf"
      )
    ).toEqual({ n: 1 });
  });
});
