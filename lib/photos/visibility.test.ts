// Testing.md calls out security-critical paths for disproportionate coverage
// — this predicate is what stands between an external_viewer account and
// the household's private photos, reachable from the open internet via
// Tailscale Funnel.

process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import type { AuthUser } from "@/lib/core/permissions";
import { isPhotoVisibleTo, type PhotoVisibilityRow } from "./visibility";

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    role: "basic_user",
    adminScope: [],
    permissions: {
      approveOutsideCalls: false,
      manageDevices: false,
      manageParentalControls: false,
      viewChildActivityLogs: false,
      deleteContent: false,
      manageFolderPermissions: false,
      approveSensitiveOutsideTransmission: false,
      viewFamilyBoard: false,
    },
    ...overrides,
  };
}

function makeRow(overrides: Partial<PhotoVisibilityRow> = {}): PhotoVisibilityRow {
  return {
    visibility: "public",
    is_sensitive: 0,
    uploaded_by: "dad",
    folder_id: null,
    ...overrides,
  };
}

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);

  const insertUser = db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`
  );
  insertUser.run("dad", "dad.test", "Dad", "super_admin");
  insertUser.run("grandma", "grandma.test", "Grandma", "external_viewer");
  insertUser.run("uncle", "uncle.test", "Uncle", "external_viewer");

  db.prepare(
    `INSERT INTO folders (id, name, owner_id, is_default_photos_folder, permissions)
     VALUES ('family-photos', 'Family Photos', 'dad', 1, ?)`
  ).run(JSON.stringify({ users: { grandma: "view" } }));
});

describe("isPhotoVisibleTo — internal roles (unchanged behavior)", () => {
  it("a public photo is visible to any internal role, regardless of folder_id", () => {
    const malachi = makeUser({ id: "malachi", role: "basic_user" });
    return expect(isPhotoVisibleTo(malachi, makeRow({ visibility: "public", folder_id: null }))).resolves.toBe(true);
  });

  it("a private photo is visible to its uploader", () => {
    const dad = makeUser({ id: "dad", role: "super_admin" });
    return expect(isPhotoVisibleTo(dad, makeRow({ visibility: "private", uploaded_by: "dad" }))).resolves.toBe(true);
  });

  it("a private photo is hidden from someone who isn't the uploader or an admin over them", () => {
    const malachi = makeUser({ id: "malachi", role: "basic_user" });
    return expect(isPhotoVisibleTo(malachi, makeRow({ visibility: "private", uploaded_by: "dad" }))).resolves.toBe(false);
  });

  it("a public, is_sensitive photo is still visible internally — sensitivity is external_viewer-only exclusion", () => {
    const malachi = makeUser({ id: "malachi", role: "basic_user" });
    return expect(
      isPhotoVisibleTo(malachi, makeRow({ visibility: "public", is_sensitive: 1 }))
    ).resolves.toBe(true);
  });
});

describe("isPhotoVisibleTo — external_viewer", () => {
  it("visible: public, not sensitive, folder granted to this specific user", async () => {
    const grandma = makeUser({ id: "grandma", role: "external_viewer" });
    expect(
      await isPhotoVisibleTo(grandma, makeRow({ visibility: "public", is_sensitive: 0, folder_id: "family-photos" }))
    ).toBe(true);
  });

  it("hidden: public, not sensitive, but this external_viewer has no grant on the folder", async () => {
    const uncle = makeUser({ id: "uncle", role: "external_viewer" });
    expect(
      await isPhotoVisibleTo(uncle, makeRow({ visibility: "public", is_sensitive: 0, folder_id: "family-photos" }))
    ).toBe(false);
  });

  it("hidden: sensitive photo, even with a folder grant — always excluded for this role", async () => {
    const grandma = makeUser({ id: "grandma", role: "external_viewer" });
    expect(
      await isPhotoVisibleTo(grandma, makeRow({ visibility: "public", is_sensitive: 1, folder_id: "family-photos" }))
    ).toBe(false);
  });

  it("hidden: private photo, even with a folder grant", async () => {
    const grandma = makeUser({ id: "grandma", role: "external_viewer" });
    expect(
      await isPhotoVisibleTo(grandma, makeRow({ visibility: "private", is_sensitive: 0, folder_id: "family-photos" }))
    ).toBe(false);
  });

  it("hidden: no folder_id at all (e.g. a pre-migration photo that was never backfilled)", async () => {
    const grandma = makeUser({ id: "grandma", role: "external_viewer" });
    expect(
      await isPhotoVisibleTo(grandma, makeRow({ visibility: "public", is_sensitive: 0, folder_id: null }))
    ).toBe(false);
  });
});
