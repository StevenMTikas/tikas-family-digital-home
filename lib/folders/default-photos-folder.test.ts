process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { getDefaultPhotosFolderId } from "./default-photos-folder";

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../db/schema.sql"), "utf8");
  getDb().exec(schema);
  getDb().prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`).run();
});

describe("getDefaultPhotosFolderId", () => {
  it("returns null when no default photos folder exists yet", () => {
    expect(getDefaultPhotosFolderId(getDb())).toBeNull();
  });

  it("returns the default photos folder's id once one exists", () => {
    getDb()
      .prepare(
        `INSERT INTO folders (id, name, owner_id, is_default_photos_folder) VALUES ('family-photos', 'Family Photos', 'dad', 1)`
      )
      .run();
    expect(getDefaultPhotosFolderId(getDb())).toBe("family-photos");
  });

  it("ignores an ordinary (non-default) folder", () => {
    getDb().prepare(`INSERT INTO folders (id, name, owner_id, is_default_photos_folder) VALUES ('private', 'Private', 'dad', 0)`).run();
    expect(getDefaultPhotosFolderId(getDb())).toBe("family-photos");
  });

  it("is distinct from the shared 'Whole Family' documents folder", () => {
    getDb()
      .prepare(
        `INSERT INTO folders (id, name, owner_id, is_shared_family_folder) VALUES ('whole-family', 'Whole Family', 'dad', 1)`
      )
      .run();
    expect(getDefaultPhotosFolderId(getDb())).toBe("family-photos");
  });
});
