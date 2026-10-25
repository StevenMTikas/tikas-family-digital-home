process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { DELETE } from "./route";

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
  // Grants basic_user role-level "delete" — the same shape that made the old
  // canAccessFolder-based check wrongly succeed for Documents.
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, is_shared_family_folder, permissions) VALUES ('folder-grants-delete', 'F', 'dad', 0, ?)`
  ).run(JSON.stringify({ roles: { basic_user: "delete" } }));
});

function insertItem(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? randomUUID();
  getDb()
    .prepare(`INSERT INTO family_knowledge_items (id, title, folder_id, created_by) VALUES (@id, @title, @folder_id, @created_by)`)
    .run({ id, title: "Emergency Contacts", folder_id: "folder-grants-delete", created_by: "dad", ...overrides });
  return id;
}

function req(userId: string | null) {
  return new NextRequest("http://localhost/api/family-knowledge/x", {
    method: "DELETE",
    headers: userId ? { "x-user-id": userId } : {},
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/family-knowledge/[id]", () => {
  it("requires authentication", async () => {
    const id = insertItem();
    const res = await DELETE(req(null), idParams(id));
    expect(res.status).toBe(401);
  });

  it("404s for a nonexistent item", async () => {
    const res = await DELETE(req("dad"), idParams(randomUUID()));
    expect(res.status).toBe(404);
  });

  it("forbids a user with folder Delete access but no deleteContent permission (the fixed bug)", async () => {
    const id = insertItem();
    const res = await DELETE(req("malachi"), idParams(id));
    expect(res.status).toBe(403);
    expect(getDb().prepare(`SELECT * FROM family_knowledge_items WHERE id = ?`).get(id)).toBeTruthy();
  });

  it("allows a user with deleteContent but no folder grant at all", async () => {
    const id = insertItem({ folder_id: null });
    const res = await DELETE(req("vee"), idParams(id));
    expect(res.status).toBe(204);
    expect(getDb().prepare(`SELECT * FROM family_knowledge_items WHERE id = ?`).get(id)).toBeUndefined();
  });

  it("deletes and logs family_knowledge_item_deleted for a Super Admin", async () => {
    const id = insertItem({ title: "Insurance Policy" });
    const res = await DELETE(req("dad"), idParams(id));
    expect(res.status).toBe(204);

    // Matched by this test's own item id, not "most recent" — created_at has
    // only second-level resolution, so it can't disambiguate between this
    // test's event and the deleteContent-only test's event above.
    const events = getDb()
      .prepare(`SELECT user_id, detail FROM security_events WHERE type = 'family_knowledge_item_deleted'`)
      .all() as { user_id: string; detail: string }[];
    const event = events.find((e) => JSON.parse(e.detail).itemId === id);
    expect(event?.user_id).toBe("dad");
    expect(JSON.parse(event!.detail).title).toBe("Insurance Policy");
  });
});
