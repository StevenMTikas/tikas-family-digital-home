process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import os from "os";
import { mkdtemp, rm } from "fs/promises";
import { NextRequest } from "next/server";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";

// saveUploadedFile (lib/storage/files.ts) reads UPLOADS_DIR eagerly at
// module-load time, so it must be set before that module is first evaluated
// — the route is imported dynamically inside each test, after this runs.
let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), "tikas-documents-route-test-"));
  process.env.UPLOADS_DIR = tmpRoot;

  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user')`
  ).run();
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, is_shared_family_folder, permissions) VALUES ('shared', 'Shared', 'dad', 1, ?)`
  ).run(JSON.stringify({ roles: { basic_user: "edit" } }));
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

function getReq(userId: string | null) {
  return new NextRequest("http://localhost/api/documents", {
    headers: userId ? { "x-user-id": userId } : {},
  });
}

async function postReq(userId: string | null, title: string) {
  const formData = new FormData();
  formData.set("file", new File(["hello world"], "test.txt", { type: "text/plain" }));
  formData.set("title", title);
  return new NextRequest("http://localhost/api/documents", {
    method: "POST",
    headers: userId ? { "x-user-id": userId } : {},
    body: formData,
  });
}

describe("GET /api/documents", () => {
  it("sets canDelete from the deleteContent permission, not folder access", async () => {
    const { GET } = await import("./route");
    getDb()
      .prepare(
        `INSERT INTO documents (id, file, title, folder_id, uploaded_by) VALUES ('doc-1', 'x', 'Doc 1', 'shared', 'dad')`
      )
      .run();

    // malachi has folder Edit (via the shared folder's role grant) but no
    // deleteContent permission — canDelete must be false regardless.
    const res = await GET(getReq("malachi"));
    const body = (await res.json()) as { id: string; canDelete: boolean }[];
    const doc = body.find((d) => d.id === "doc-1");
    expect(doc?.canDelete).toBe(false);
  });
});

describe("POST /api/documents", () => {
  it("requires authentication", async () => {
    const { POST } = await import("./route");
    const res = await POST(await postReq(null, "Untitled"));
    expect(res.status).toBe(401);
  });

  it("uploads and logs a document_uploaded security event", async () => {
    const { POST } = await import("./route");
    const res = await POST(await postReq("dad", "New Doc"));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; title: string };
    expect(body.title).toBe("New Doc");

    const event = getDb()
      .prepare(`SELECT user_id, detail FROM security_events WHERE type = 'document_uploaded' ORDER BY created_at DESC LIMIT 1`)
      .get() as { user_id: string; detail: string };
    expect(event.user_id).toBe("dad");
    const detail = JSON.parse(event.detail);
    expect(detail.documentId).toBe(body.id);
    expect(detail.title).toBe("New Doc");
  });
});
