process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { getDefaultFolderId } from "./default-folder";

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../db/schema.sql"), "utf8");
  getDb().exec(schema);
  getDb().prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`).run();
});

describe("getDefaultFolderId", () => {
  it("returns null when no shared family folder exists yet", () => {
    expect(getDefaultFolderId(getDb())).toBeNull();
  });

  it("returns the shared family folder's id once one exists", () => {
    getDb()
      .prepare(
        `INSERT INTO folders (id, name, owner_id, is_shared_family_folder) VALUES ('whole-family', 'Whole Family', 'dad', 1)`
      )
      .run();
    expect(getDefaultFolderId(getDb())).toBe("whole-family");
  });

  it("ignores an ordinary (non-shared) folder", () => {
    getDb().prepare(`INSERT INTO folders (id, name, owner_id, is_shared_family_folder) VALUES ('private', 'Private', 'dad', 0)`).run();
    expect(getDefaultFolderId(getDb())).toBe("whole-family");
  });
});
