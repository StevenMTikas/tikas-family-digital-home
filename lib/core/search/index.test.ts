process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

// generateEmbedding normally calls Ollama over HTTP — replaced here with a
// deterministic, dependency-free stand-in so these tests don't need a real
// Ollama server. Character-hash buckets aren't real semantics, but they're
// consistent (same text -> same vector, overlapping text -> closer vectors),
// which is all indexContent/searchContent's own logic needs to be exercised.
vi.mock("./embeddings", () => ({
  generateEmbedding: vi.fn(async (text: string) => {
    const vec = new Array(768).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[text.charCodeAt(i) % 768] += 1;
    }
    return vec;
  }),
}));

const { indexContent, removeFromIndex, searchContent } = await import("./index");

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);

  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
    "dad",
    "dad.test",
    "Dad",
    "super_admin"
  );
  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
    "malachi",
    "malachi.test",
    "Malachi",
    "basic_user"
  );

  // Folder Malachi has no access to at all.
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, parent_folder_id, inherits_permissions, permissions, is_shared_family_folder)
     VALUES ('private-folder', 'Private', 'dad', NULL, 0, ?, 0)`
  ).run(JSON.stringify({ users: { dad: "view" } }));

  // Folder everyone (including Malachi's role) can view.
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, parent_folder_id, inherits_permissions, permissions, is_shared_family_folder)
     VALUES ('shared-folder', 'Shared', 'dad', NULL, 0, ?, 0)`
  ).run(JSON.stringify({ roles: { basic_user: "view" } }));
});

describe("indexContent / searchContent — documents", () => {
  it("finds a document by its indexed text, but only for a user with folder View access", async () => {
    const db = getDb();
    const docId = randomUUID();
    db.prepare(
      `INSERT INTO documents (id, file, title, folder_id, category, uploaded_by) VALUES (?, '', ?, ?, ?, 'dad')`
    ).run(docId, "Tax Return 2025", "shared-folder", "tax");
    await indexContent("document", docId, "Tax Return 2025 tax");

    const dad = await getAuthUser("dad");
    const malachi = await getAuthUser("malachi");
    expect(dad).not.toBeNull();
    expect(malachi).not.toBeNull();

    const resultsForDad = await searchContent(dad!, "Tax Return 2025 tax");
    expect(resultsForDad.some((r) => r.id === docId && r.type === "document")).toBe(true);

    // Malachi's role does have view access to shared-folder in this fixture,
    // so he should see it too — proves the permission check actually runs
    // (not just "always true"), by checking the negative case below.
    const resultsForMalachi = await searchContent(malachi!, "Tax Return 2025 tax");
    expect(resultsForMalachi.some((r) => r.id === docId)).toBe(true);
  });

  it("excludes a document in a folder the searching user cannot view", async () => {
    const db = getDb();
    const docId = randomUUID();
    db.prepare(
      `INSERT INTO documents (id, file, title, folder_id, category, uploaded_by) VALUES (?, '', ?, ?, ?, 'dad')`
    ).run(docId, "Secret Medical Record", "private-folder", "medical");
    await indexContent("document", docId, "Secret Medical Record medical");

    const malachi = await getAuthUser("malachi");
    const results = await searchContent(malachi!, "Secret Medical Record medical");
    expect(results.some((r) => r.id === docId)).toBe(false);

    const dad = await getAuthUser("dad");
    const dadResults = await searchContent(dad!, "Secret Medical Record medical");
    expect(dadResults.some((r) => r.id === docId)).toBe(true);
  });

  it("stops returning a removed item", async () => {
    const db = getDb();
    const docId = randomUUID();
    db.prepare(
      `INSERT INTO documents (id, file, title, folder_id, category, uploaded_by) VALUES (?, '', ?, ?, ?, 'dad')`
    ).run(docId, "Temporary Doc", "shared-folder", "misc");
    await indexContent("document", docId, "Temporary Doc misc");

    const dad = await getAuthUser("dad");
    expect((await searchContent(dad!, "Temporary Doc misc")).some((r) => r.id === docId)).toBe(true);

    removeFromIndex("document", docId);
    expect((await searchContent(dad!, "Temporary Doc misc")).some((r) => r.id === docId)).toBe(false);
  });

  it("re-indexing the same item upserts rather than duplicating", async () => {
    const db = getDb();
    const docId = randomUUID();
    db.prepare(
      `INSERT INTO documents (id, file, title, folder_id, category, uploaded_by) VALUES (?, '', ?, ?, ?, 'dad')`
    ).run(docId, "Renamed Doc", "shared-folder", "misc");
    await indexContent("document", docId, "Original Title");
    await indexContent("document", docId, "Renamed Doc misc");

    const count = db.prepare(`SELECT COUNT(*) c FROM vec_content WHERE content_key = ?`).get(`document:${docId}`) as { c: number };
    expect(count.c).toBe(1);

    const dad = await getAuthUser("dad");
    const results = await searchContent(dad!, "Renamed Doc misc");
    expect(results.some((r) => r.id === docId)).toBe(true);
  });
});

describe("searchContent — photos", () => {
  it("excludes a private photo from anyone but the uploader/admin", async () => {
    const db = getDb();
    const photoId = randomUUID();
    db.prepare(
      `INSERT INTO photos (id, file, uploaded_by, tags, visibility) VALUES (?, '', 'dad', ?, 'private')`
    ).run(photoId, JSON.stringify(["#birthday", "#malachi"]));
    await indexContent("photo", photoId, "#birthday #malachi");

    const dad = await getAuthUser("dad");
    const malachi = await getAuthUser("malachi");

    expect((await searchContent(dad!, "#birthday #malachi")).some((r) => r.id === photoId)).toBe(true);
    expect((await searchContent(malachi!, "#birthday #malachi")).some((r) => r.id === photoId)).toBe(false);
  });
});
