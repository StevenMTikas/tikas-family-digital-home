process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import os from "os";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";

// readUploadedFile (lib/storage/files.ts) reads UPLOADS_DIR eagerly at
// module-load time, so it must be set before that module is first evaluated
// — the route is imported dynamically inside each test, after this runs.
let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), "tikas-doc-download-test-"));
  process.env.UPLOADS_DIR = tmpRoot;

  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user')`
  ).run();
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, is_shared_family_folder, permissions) VALUES ('viewable', 'Viewable', 'dad', 0, ?)`
  ).run(JSON.stringify({ roles: { basic_user: "view" } }));
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, is_shared_family_folder, permissions) VALUES ('no-access', 'NoAccess', 'dad', 0, ?)`
  ).run(JSON.stringify({ roles: {} }));
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

async function insertDocument(folderId: string, contents: string) {
  const id = randomUUID();
  const relPath = path.join("documents", `${id}.txt`);
  await mkdir(path.join(tmpRoot, "documents"), { recursive: true });
  await writeFile(path.join(tmpRoot, relPath), contents);
  getDb()
    .prepare(`INSERT INTO documents (id, file, title, folder_id, uploaded_by) VALUES (?, ?, ?, ?, 'dad')`)
    .run(id, relPath, "Test Doc", folderId);
  return id;
}

function req(userId: string | null) {
  return new NextRequest("http://localhost/api/documents/x/download", {
    headers: userId ? { "x-user-id": userId } : {},
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/documents/[id]/download", () => {
  it("requires authentication", async () => {
    const { GET } = await import("./route");
    const id = await insertDocument("viewable", "hello");
    const res = await GET(req(null), idParams(id));
    expect(res.status).toBe(401);
  });

  it("404s for a nonexistent document", async () => {
    const { GET } = await import("./route");
    const res = await GET(req("dad"), idParams(randomUUID()));
    expect(res.status).toBe(404);
  });

  it("forbids a user without View access to the folder", async () => {
    const { GET } = await import("./route");
    const id = await insertDocument("no-access", "hello");
    const res = await GET(req("malachi"), idParams(id));
    expect(res.status).toBe(403);
  });

  it("streams the file and logs a document_downloaded security event", async () => {
    const { GET } = await import("./route");
    const id = await insertDocument("viewable", "hello world");
    const res = await GET(req("malachi"), idParams(id));
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString("utf8")).toBe("hello world");

    const event = getDb()
      .prepare(`SELECT user_id, detail FROM security_events WHERE type = 'document_downloaded' ORDER BY created_at DESC LIMIT 1`)
      .get() as { user_id: string; detail: string };
    expect(event.user_id).toBe("malachi");
    expect(JSON.parse(event.detail).documentId).toBe(id);
  });
});
