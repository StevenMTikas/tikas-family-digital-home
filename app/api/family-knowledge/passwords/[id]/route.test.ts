process.env.DATABASE_PATH = ":memory:";
process.env.PASSWORD_ENCRYPTION_KEY = "test-only-password-key-not-a-secret";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { GET } from "./route";

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
    `INSERT INTO folders (id, name, owner_id, is_shared_family_folder, permissions) VALUES ('viewable', 'Viewable', 'dad', 0, ?)`
  ).run(JSON.stringify({ roles: { basic_user: "view" } }));
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, is_shared_family_folder, permissions) VALUES ('no-access', 'NoAccess', 'dad', 0, ?)`
  ).run(JSON.stringify({ roles: {} }));
});

function insertEntry(folderId: string) {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO password_entries (id, service_name, username, password, folder_id, created_by) VALUES (?, ?, ?, ?, ?, 'dad')`
    )
    .run(id, "Netflix", "family@example.com", encryptSecret("super-secret-password"), folderId);
  return id;
}

function req(userId: string | null) {
  return new NextRequest("http://localhost/api/family-knowledge/passwords/x", {
    headers: userId ? { "x-user-id": userId } : {},
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/family-knowledge/passwords/[id]", () => {
  it("requires authentication", async () => {
    const id = insertEntry("viewable");
    const res = await GET(req(null), idParams(id));
    expect(res.status).toBe(401);
  });

  it("forbids a user without View access to the folder", async () => {
    const id = insertEntry("no-access");
    const res = await GET(req("malachi"), idParams(id));
    expect(res.status).toBe(403);
  });

  it("reveals the decrypted password and logs password_viewed without the password in detail", async () => {
    const id = insertEntry("viewable");
    const res = await GET(req("malachi"), idParams(id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { password: string; serviceName: string };
    expect(body.password).toBe("super-secret-password");

    const event = getDb()
      .prepare(`SELECT user_id, detail FROM security_events WHERE type = 'password_viewed' ORDER BY created_at DESC LIMIT 1`)
      .get() as { user_id: string; detail: string };
    expect(event.user_id).toBe("malachi");
    const detail = JSON.parse(event.detail);
    expect(detail.entryId).toBe(id);
    expect(detail.serviceName).toBe("Netflix");
    expect(JSON.stringify(detail)).not.toContain("super-secret-password");
  });
});
