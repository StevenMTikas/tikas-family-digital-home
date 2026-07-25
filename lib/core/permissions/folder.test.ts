// Integration tests for canAccessFolder against a real (in-memory) SQLite
// database — Testing.md calls out folder permission checks (view/edit/delete,
// inheritance, override) by name as a security-critical path.

process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { canAccessFolder } from "./index";

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);

  const insertUser = db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`
  );
  insertUser.run("dad", "dad.test", "Dad", "super_admin");
  insertUser.run("vee", "vee.test", "Vee", "admin");
  insertUser.run("malachi", "malachi.test", "Malachi", "basic_user");
  // Same role as Malachi — proves role grants apply to the role, not a
  // specific known person.
  insertUser.run("cousin", "cousin.test", "Cousin", "basic_user");
  // No matching user or role grant anywhere in these fixtures.
  insertUser.run("other-admin", "other-admin.test", "Other Admin", "admin");

  const insertFolder = db.prepare(
    `INSERT INTO folders (id, name, owner_id, parent_folder_id, inherits_permissions, permissions, is_shared_family_folder)
     VALUES (?, ?, 'dad', ?, ?, ?, 0)`
  );
  // Root: Malachi's role gets view, Vee gets an individual edit grant.
  insertFolder.run(
    "root",
    "Root",
    null,
    1,
    JSON.stringify({ roles: { basic_user: "view" }, users: { vee: "edit" } })
  );
  // Inherits from root (no permissions of its own).
  insertFolder.run("sub-inherit", "Sub Inherit", "root", 1, null);
  // Overrides root — its own grants are authoritative, root's don't apply.
  insertFolder.run(
    "sub-override",
    "Sub Override",
    "root",
    0,
    JSON.stringify({ roles: { basic_user: "delete" } })
  );
});

describe("canAccessFolder", () => {
  it("grants access via a direct per-user grant, respecting the level hierarchy", async () => {
    expect(await canAccessFolder({ userId: "vee" }, "root", "view")).toBe(true);
    expect(await canAccessFolder({ userId: "vee" }, "root", "edit")).toBe(true);
    expect(await canAccessFolder({ userId: "vee" }, "root", "delete")).toBe(false);
  });

  it("grants access via a per-role grant", async () => {
    expect(await canAccessFolder({ userId: "malachi" }, "root", "view")).toBe(true);
    expect(await canAccessFolder({ userId: "malachi" }, "root", "edit")).toBe(false);
  });

  it("grants access to anyone sharing a role with a grant, not just a specific known person", async () => {
    expect(await canAccessFolder({ userId: "cousin" }, "root", "view")).toBe(true);
  });

  it("denies access when neither the user nor their role has a grant", async () => {
    expect(await canAccessFolder({ userId: "other-admin" }, "root", "view")).toBe(false);
  });

  it("Super Admin bypasses folder checks unconditionally, even with no grant", async () => {
    expect(await canAccessFolder({ userId: "dad" }, "root", "delete")).toBe(true);
  });

  it("an inheriting subfolder resolves to its parent's permissions", async () => {
    expect(await canAccessFolder({ userId: "malachi" }, "sub-inherit", "view")).toBe(true);
    expect(await canAccessFolder({ userId: "vee" }, "sub-inherit", "edit")).toBe(true);
  });

  it("an overridden subfolder uses its own permissions, not the parent's", async () => {
    // Malachi's role grant on the override folder is stronger than on root.
    expect(await canAccessFolder({ userId: "malachi" }, "sub-override", "delete")).toBe(true);
    // Vee's direct grant on root does NOT carry over to the override folder.
    expect(await canAccessFolder({ userId: "vee" }, "sub-override", "view")).toBe(false);
  });

  it("denies access to a non-Super-Admin for a folder that doesn't exist", async () => {
    expect(await canAccessFolder({ userId: "malachi" }, "no-such-folder", "view")).toBe(false);
  });

  it("Super Admin's bypass doesn't require the folder to exist", async () => {
    expect(await canAccessFolder({ userId: "dad" }, "no-such-folder", "view")).toBe(true);
  });
});
