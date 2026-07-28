process.env.DATABASE_PATH = ":memory:";
process.env.UPLOADS_DIR = "/tmp/tikas-connector-test-uploads";

import fs from "fs";
import path from "path";
import { beforeEach, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import {
  authenticateConnector,
  applySyncBatch,
  getPendingFileRequests,
  requestFile,
  receiveFetchedFile,
  generateAuthToken,
  unsupportedFolderTypesFor,
  excludeSourcePath,
  type ConnectorDevice,
} from "./index";

beforeEach(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec("PRAGMA foreign_keys = OFF;");
  // Fresh DB each test — drop everything from a prior test in this same in-memory connection.
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as {
    name: string;
  }[];
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  db.exec(schema);

  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
    "vee",
    "vee.test",
    "Vee",
    "admin"
  );
});

function insertDevice(overrides: Partial<{ status: string; authToken: string | null; designatedFolders: string[] | null }> = {}) {
  const db = getDb();
  const id = "device-1";
  db.prepare(
    `INSERT INTO devices (id, user_id, device_type, device_name, status, added_by, auth_token, designated_folders)
     VALUES (?, 'vee', 'computer', 'Vee''s Laptop', ?, 'vee', ?, ?)`
  ).run(
    id,
    overrides.status ?? "trusted",
    overrides.authToken === undefined ? "secret-token" : overrides.authToken,
    overrides.designatedFolders === undefined ? JSON.stringify(["camera_photos", "documents"]) : overrides.designatedFolders ? JSON.stringify(overrides.designatedFolders) : null
  );
  return id;
}

describe("authenticateConnector", () => {
  it("succeeds for a trusted device with a matching token", () => {
    insertDevice();
    const device = authenticateConnector("device-1", "secret-token");
    expect(device).not.toBeNull();
    expect(device!.userId).toBe("vee");
    expect(device!.designatedFolders).toEqual(["camera_photos", "documents"]);
  });

  it("fails for a wrong token", () => {
    insertDevice();
    expect(authenticateConnector("device-1", "wrong-token")).toBeNull();
  });

  it("fails for a revoked device even with the right token", () => {
    insertDevice({ status: "revoked" });
    expect(authenticateConnector("device-1", "secret-token")).toBeNull();
  });

  it("fails for a device with no connector enabled (no auth_token set)", () => {
    insertDevice({ authToken: null });
    expect(authenticateConnector("device-1", "secret-token")).toBeNull();
  });

  it("fails for an unknown device id", () => {
    expect(authenticateConnector("does-not-exist", "secret-token")).toBeNull();
  });

  it("generates a distinct token each call", () => {
    expect(generateAuthToken()).not.toBe(generateAuthToken());
  });
});

describe("unsupportedFolderTypesFor", () => {
  it("allows a computer both folder types", () => {
    expect(unsupportedFolderTypesFor("computer", ["camera_photos", "documents"])).toEqual([]);
  });

  it("allows a phone camera photos", () => {
    expect(unsupportedFolderTypesFor("phone", ["camera_photos"])).toEqual([]);
  });

  it("rejects documents on a phone — the Android connector can't read them", () => {
    expect(unsupportedFolderTypesFor("phone", ["camera_photos", "documents"])).toEqual(["documents"]);
  });

  it("treats an empty designation as supported (a device with no connector at all)", () => {
    expect(unsupportedFolderTypesFor("phone", [])).toEqual([]);
  });
});

describe("applySyncBatch", () => {
  function device(designatedFolders: string[] = ["camera_photos", "documents"]): ConnectorDevice {
    insertDevice({ designatedFolders: designatedFolders as any });
    return { id: "device-1", userId: "vee", deviceType: "computer", designatedFolders: designatedFolders as any };
  }

  it("creates a metadata_only row for a new photo", () => {
    const result = applySyncBatch(device(), [
      { path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z", thumbnail: "data:image/jpeg;base64,AAA" },
    ]);
    expect(result).toEqual({ created: 1, updated: 0, removed: 0 });

    const row = getDb().prepare(`SELECT * FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any;
    expect(row.sync_status).toBe("metadata_only");
    expect(row.file).toBe("");
    expect(row.thumbnail).toBe("data:image/jpeg;base64,AAA");
    expect(row.uploaded_by).toBe("vee");
  });

  it("creates a metadata_only row for a new document", () => {
    applySyncBatch(device(), [
      { path: "/Documents/report.pdf", filename: "report.pdf", folderType: "documents", modifiedAt: "2026-01-01T00:00:00Z" },
    ]);
    const row = getDb().prepare(`SELECT * FROM documents WHERE source_path = '/Documents/report.pdf'`).get() as any;
    expect(row.sync_status).toBe("metadata_only");
    expect(row.title).toBe("report.pdf");
  });

  it("ignores items outside the device's designated folders", () => {
    const result = applySyncBatch(device(["camera_photos"]), [
      { path: "/Documents/report.pdf", filename: "report.pdf", folderType: "documents", modifiedAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(result).toEqual({ created: 0, updated: 0, removed: 0 });
  });

  it("marks a file removed_from_source when a later sync no longer reports it, without deleting it", () => {
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);

    const result = applySyncBatch(d, []); // next sync: file no longer present
    expect(result.removed).toBe(1);

    const row = getDb().prepare(`SELECT * FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any;
    expect(row).toBeDefined(); // still exists
    expect(row.removed_from_source_at).not.toBeNull();
  });

  it("clears removed_from_source_at if the file reappears in a later sync", () => {
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);
    applySyncBatch(d, []);
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-02T00:00:00Z" }]);

    const row = getDb().prepare(`SELECT * FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any;
    expect(row.removed_from_source_at).toBeNull();
  });

  it("reverts an already-fetched file back to metadata_only when it changes on the device", () => {
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);
    getDb().prepare(`UPDATE photos SET sync_status = 'fetched', file = 'photos/abc.jpg' WHERE source_path = '/DCIM/img1.jpg'`).run();

    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-05T00:00:00Z" }]);

    const row = getDb().prepare(`SELECT * FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any;
    expect(row.sync_status).toBe("metadata_only");
  });

  it("does NOT revert an already-fetched file back to metadata_only when it's reported again unchanged (regression: caught during live testing)", () => {
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);
    getDb().prepare(`UPDATE photos SET sync_status = 'fetched', file = 'photos/abc.jpg' WHERE source_path = '/DCIM/img1.jpg'`).run();

    // Same modifiedAt as before — nothing actually changed on the device.
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);

    const row = getDb().prepare(`SELECT * FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any;
    expect(row.sync_status).toBe("fetched");
  });

  it("updates devices.last_sync_at", () => {
    const d = device();
    applySyncBatch(d, []);
    const row = getDb().prepare(`SELECT last_sync_at FROM devices WHERE id = 'device-1'`).get() as any;
    expect(row.last_sync_at).not.toBeNull();
  });

  it("keeps the stored thumbnail when a later sync reports the photo without one", () => {
    // A connector that couldn't build a thumbnail this run (transient decode
    // failure), or that deliberately skips rebuilding thumbnails for
    // unchanged photos (the phone connector does), must not wipe a good one.
    const d = device();
    applySyncBatch(d, [
      { path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z", thumbnail: "data:image/jpeg;base64,GOOD" },
    ]);

    applySyncBatch(d, [
      { path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-02-02T00:00:00Z" }, // changed, no thumbnail sent
    ]);

    const row = getDb().prepare(`SELECT * FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any;
    expect(row.thumbnail).toBe("data:image/jpeg;base64,GOOD");
    expect(row.source_modified_at).toBe("2026-02-02T00:00:00Z"); // the change itself still applied
  });

  it("replaces the stored thumbnail when a new one is actually sent", () => {
    const d = device();
    applySyncBatch(d, [
      { path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z", thumbnail: "data:image/jpeg;base64,OLD" },
    ]);
    applySyncBatch(d, [
      { path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-02-02T00:00:00Z", thumbnail: "data:image/jpeg;base64,NEW" },
    ]);

    const row = getDb().prepare(`SELECT * FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any;
    expect(row.thumbnail).toBe("data:image/jpeg;base64,NEW");
  });

  it("reports 0 updated when an unchanged file is simply re-reported", () => {
    // Every daily sync re-reports the whole folder; counting all of it as
    // "updated" made the connector's own log meaningless.
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);

    const result = applySyncBatch(d, [
      { path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(result).toEqual({ created: 0, updated: 0, removed: 0 });
  });

  it("counts a genuinely changed file as updated", () => {
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);

    const result = applySyncBatch(d, [
      { path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-03-03T00:00:00Z" },
    ]);
    expect(result.updated).toBe(1);
  });

  it("clears removed_from_source_at when a file reappears unchanged, and counts it as updated", () => {
    // The mtime is identical to before, so the 'nothing changed, skip the
    // write' path must not swallow the un-removal.
    const d = device();
    const item = { path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos" as const, modifiedAt: "2026-01-01T00:00:00Z" };
    applySyncBatch(d, [item]);
    applySyncBatch(d, []); // disappears
    const result = applySyncBatch(d, [item]); // reappears, untouched

    const row = getDb().prepare(`SELECT * FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any;
    expect(row.removed_from_source_at).toBeNull();
    expect(result.updated).toBe(1);
  });

  it("does not mark files removed for a folder type the device is no longer designated for", () => {
    // Un-checking 'documents' in the admin UI must not make already-synced
    // documents claim they were deleted off the device — they're just not
    // being watched anymore.
    const both = device(["camera_photos", "documents"]);
    applySyncBatch(both, [
      { path: "/Documents/report.pdf", filename: "report.pdf", folderType: "documents", modifiedAt: "2026-01-01T00:00:00Z" },
    ]);

    const photosOnly: ConnectorDevice = { ...both, designatedFolders: ["camera_photos"] };
    const result = applySyncBatch(photosOnly, []);

    const row = getDb().prepare(`SELECT * FROM documents WHERE source_path = '/Documents/report.pdf'`).get() as any;
    expect(row.removed_from_source_at).toBeNull();
    expect(result.removed).toBe(0);
  });

  it("does not create duplicate rows when one batch reports the same path twice", () => {
    const d = device();
    const result = applySyncBatch(d, [
      { path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" },
      { path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" },
    ]);

    expect(result.created).toBe(1);
    const count = (getDb().prepare(`SELECT COUNT(*) c FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any).c;
    expect(count).toBe(1);
  });

  it("scopes the diff to the syncing device — another device's files are untouched", () => {
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);

    getDb()
      .prepare(
        `INSERT INTO devices (id, user_id, device_type, device_name, status, added_by, auth_token, designated_folders)
         VALUES ('device-2', 'vee', 'phone', 'Vee''s Phone', 'trusted', 'vee', 'other-token', ?)`
      )
      .run(JSON.stringify(["camera_photos"]));
    getDb()
      .prepare(
        `INSERT INTO photos (id, file, uploaded_by, visibility, is_sensitive, source_device_id, source_path, sync_status)
         VALUES ('other-photo', '', 'vee', 'public', 0, 'device-2', '/DCIM/other.jpg', 'metadata_only')`
      )
      .run();

    applySyncBatch(d, []); // device-1 reports nothing at all

    const other = getDb().prepare(`SELECT * FROM photos WHERE id = 'other-photo'`).get() as any;
    expect(other.removed_from_source_at).toBeNull();
  });

  it("does not recreate an excluded item even though the connector keeps reporting it", () => {
    // The real scenario this exists for: a family member deletes a synced
    // receipt photo from Content, but it's still sitting in their camera
    // roll, so the connector reports it again on every future sync.
    const d = device();
    const item = { path: "/DCIM/receipt.jpg", filename: "receipt.jpg", folderType: "camera_photos" as const, modifiedAt: "2026-01-01T00:00:00Z" };
    applySyncBatch(d, [item]);
    expect(getDb().prepare(`SELECT COUNT(*) c FROM photos WHERE source_path = '/DCIM/receipt.jpg'`).get()).toEqual({ c: 1 });

    excludeSourcePath(d.id, "/DCIM/receipt.jpg");
    getDb().prepare(`DELETE FROM photos WHERE source_path = '/DCIM/receipt.jpg'`).run(); // what the exclude API route does

    const result = applySyncBatch(d, [item]); // connector keeps reporting it — it has no idea it was deleted
    expect(result).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(getDb().prepare(`SELECT COUNT(*) c FROM photos WHERE source_path = '/DCIM/receipt.jpg'`).get()).toEqual({ c: 0 });
  });

  it("scopes exclusions to the specific device — a different device can still sync the same relative path", () => {
    const d = device();
    excludeSourcePath(d.id, "/DCIM/receipt.jpg");

    getDb()
      .prepare(
        `INSERT INTO devices (id, user_id, device_type, device_name, status, added_by, auth_token, designated_folders)
         VALUES ('device-3', 'vee', 'phone', 'Another Phone', 'trusted', 'vee', 'yet-another-token', ?)`
      )
      .run(JSON.stringify(["camera_photos"]));
    const otherDevice: ConnectorDevice = { id: "device-3", userId: "vee", deviceType: "phone", designatedFolders: ["camera_photos"] };

    const result = applySyncBatch(otherDevice, [
      { path: "/DCIM/receipt.jpg", filename: "receipt.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(result.created).toBe(1);
  });

  it("excludeSourcePath is idempotent", () => {
    const d = device();
    expect(() => {
      excludeSourcePath(d.id, "/DCIM/receipt.jpg");
      excludeSourcePath(d.id, "/DCIM/receipt.jpg");
    }).not.toThrow();
  });
});

describe("pending file requests + fetch", () => {
  function device(): ConnectorDevice {
    insertDevice();
    return { id: "device-1", userId: "vee", deviceType: "computer", designatedFolders: ["camera_photos", "documents"] };
  }

  it("returns nothing until a file is explicitly requested", () => {
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);
    expect(getPendingFileRequests(d)).toEqual([]);
  });

  it("surfaces a requested file, and requesting again is a no-op", () => {
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);
    const photoId = (getDb().prepare(`SELECT id FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any).id;

    requestFile("photo", photoId);
    requestFile("photo", photoId); // idempotent

    const pending = getPendingFileRequests(d);
    expect(pending).toEqual([{ contentType: "photo", id: photoId, sourcePath: "/DCIM/img1.jpg" }]);
  });

  it("receiveFetchedFile stores the file and marks the record fetched", async () => {
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);
    const photoId = (getDb().prepare(`SELECT id FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any).id;
    requestFile("photo", photoId);

    await receiveFetchedFile(d, "photo", photoId, "img1.jpg", Buffer.from("fake-image-bytes"));

    const row = getDb().prepare(`SELECT * FROM photos WHERE id = ?`).get(photoId) as any;
    expect(row.sync_status).toBe("fetched");
    expect(row.file_requested_at).toBeNull();
    expect(row.file).not.toBe("");
  });

  it("rejects a device trying to supply a file for content it doesn't own", async () => {
    const d = device();
    applySyncBatch(d, [{ path: "/DCIM/img1.jpg", filename: "img1.jpg", folderType: "camera_photos", modifiedAt: "2026-01-01T00:00:00Z" }]);
    const photoId = (getDb().prepare(`SELECT id FROM photos WHERE source_path = '/DCIM/img1.jpg'`).get() as any).id;

    const otherDevice: ConnectorDevice = { id: "device-2", userId: "vee", deviceType: "computer", designatedFolders: ["camera_photos"] };
    await expect(receiveFetchedFile(otherDevice, "photo", photoId, "img1.jpg", Buffer.from("x"))).rejects.toThrow();
  });
});
