process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { PATCH, DELETE } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, delete_content) VALUES ('vee', 'vee.test', 'x', 'Vee', 'basic_user', 1)`
  ).run();
  // A folder that grants basic_user role-level "delete" — the exact shape
  // that made the old canAccessFolder-based check wrongly succeed.
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, is_shared_family_folder, permissions) VALUES ('folder-grants-delete', 'F', 'dad', 0, ?)`
  ).run(JSON.stringify({ roles: { basic_user: "view" }, users: { malachi: "delete" } }));
});

function insertDocument(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? randomUUID();
  getDb()
    .prepare(
      `INSERT INTO documents (id, file, title, folder_id, uploaded_by) VALUES (@id, @file, @title, @folder_id, @uploaded_by)`
    )
    .run({
      id,
      file: "does-not-exist-on-disk.pdf",
      title: "Test Doc",
      folder_id: "folder-grants-delete",
      uploaded_by: "dad",
      ...overrides,
    });
  return id;
}

function req(userId: string | null, body?: unknown) {
  return new NextRequest("http://localhost/api/documents/x", {
    method: body ? "PATCH" : "DELETE",
    headers: { ...(userId ? { "x-user-id": userId } : {}), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function lastEventOfType(type: string) {
  return getDb()
    .prepare(`SELECT user_id, detail FROM security_events WHERE type = ? ORDER BY created_at DESC LIMIT 1`)
    .get(type) as { user_id: string; detail: string } | undefined;
}

describe("DELETE /api/documents/[id]", () => {
  it("requires authentication", async () => {
    const id = insertDocument();
    const res = await DELETE(req(null), idParams(id));
    expect(res.status).toBe(401);
  });

  it("404s for a nonexistent document", async () => {
    const res = await DELETE(req("dad"), idParams(randomUUID()));
    expect(res.status).toBe(404);
  });

  it("forbids a user with folder Delete access but no deleteContent permission (the fixed bug)", async () => {
    const id = insertDocument();
    const res = await DELETE(req("malachi"), idParams(id));
    expect(res.status).toBe(403);
    expect(getDb().prepare(`SELECT * FROM documents WHERE id = ?`).get(id)).toBeTruthy();
  });

  it("allows a user with deleteContent but no folder grant at all", async () => {
    const id = insertDocument({ folder_id: null });
    const res = await DELETE(req("vee"), idParams(id));
    expect(res.status).toBe(204);
    expect(getDb().prepare(`SELECT * FROM documents WHERE id = ?`).get(id)).toBeUndefined();
  });

  it("deletes and logs document_deleted for a Super Admin", async () => {
    const id = insertDocument({ title: "Tax Return.pdf" });
    const res = await DELETE(req("dad"), idParams(id));
    expect(res.status).toBe(204);

    // Matched by this test's own document id, not "most recent" — created_at
    // has only second-level resolution, so it can't disambiguate between
    // this test's event and the deleteContent-only test's event above.
    const events = getDb()
      .prepare(`SELECT user_id, detail FROM security_events WHERE type = 'document_deleted'`)
      .all() as { user_id: string; detail: string }[];
    const event = events.find((e) => JSON.parse(e.detail).documentId === id);
    expect(event?.user_id).toBe("dad");
    expect(JSON.parse(event!.detail).title).toBe("Tax Return.pdf");
  });
});

describe("PATCH /api/documents/[id]", () => {
  it("logs a permission_changed event for a sensitivity change", async () => {
    const id = insertDocument({ uploaded_by: "dad" });
    const res = await PATCH(req("dad", { isSensitive: true }), idParams(id));
    expect(res.status).toBe(200);

    const event = lastEventOfType("permission_changed");
    expect(event).toBeTruthy();
    const detail = JSON.parse(event!.detail);
    expect(detail.scope).toBe("document");
    expect(detail.action).toBe("sensitivity_changed");
    expect(detail.documentId).toBe(id);
    expect(detail.isSensitive).toBe(true);
  });

  it("does not log anything for a category-only change", async () => {
    const id = insertDocument({ uploaded_by: "dad" });
    const beforeCount = (getDb().prepare(`SELECT COUNT(*) as n FROM security_events`).get() as { n: number }).n;

    const res = await PATCH(req("malachi", { category: "Medical" }), idParams(id));
    expect(res.status).toBe(200);

    const afterCount = (getDb().prepare(`SELECT COUNT(*) as n FROM security_events`).get() as { n: number }).n;
    expect(afterCount).toBe(beforeCount);
  });

  it("forbids a non-owner, non-admin from changing sensitivity", async () => {
    const id = insertDocument({ uploaded_by: "dad" });
    const res = await PATCH(req("malachi", { isSensitive: true }), idParams(id));
    expect(res.status).toBe(403);
  });
});
