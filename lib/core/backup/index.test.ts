// Backup/restore operate on real files on disk (SQLite's online backup API
// needs a real destination path, and restore swaps a real DB file) — unlike
// most other tests here, this one can't use DATABASE_PATH=":memory:".
// Everything is scoped to a unique temp directory per run and cleaned up after.

import fs from "fs";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "fs/promises";
import os from "os";
import path from "path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), "tikas-backup-test-"));
  process.env.DATABASE_PATH = path.join(tmpRoot, "db", "tikas.db");
  process.env.BACKUP_DIR = path.join(tmpRoot, "backups");
  process.env.UPLOADS_DIR = path.join(tmpRoot, "uploads");
  process.env.BACKUP_ENCRYPTION_KEY = "test-only-backup-key-not-a-secret";

  await mkdir(path.dirname(process.env.DATABASE_PATH), { recursive: true });
});

afterAll(async () => {
  const { closeDb } = await import("@/db/client");
  closeDb();
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("backup/restore", () => {
  it("creates an encrypted backup, lists it, and prunes beyond retention", async () => {
    const { getDb } = await import("@/db/client");
    const { runBackup, listBackups, RETENTION_COUNT } = await import("./index");

    const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
    getDb().exec(schema);
    getDb()
      .prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`)
      .run("dad", "dad.test", "Dad", "super_admin");

    await mkdir(process.env.UPLOADS_DIR!, { recursive: true });
    await writeFile(path.join(process.env.UPLOADS_DIR!, "note.txt"), "hello");

    const meta = await runBackup();
    expect(meta.status).toBe("success");
    expect(meta.sizeBytes).toBeGreaterThan(0);

    const backupDbRaw = await readFile(path.join(process.env.BACKUP_DIR!, meta.id, "db.enc"));
    expect(backupDbRaw.toString("utf8")).not.toContain("dad.test"); // encrypted, not a plain copy

    const list = await listBackups();
    expect(list[0]?.id).toBe(meta.id);

    // Create more than RETENTION_COUNT backups total and confirm pruning.
    for (let i = 0; i < RETENTION_COUNT; i++) {
      await new Promise((r) => setTimeout(r, 5));
      await runBackup();
    }
    const afterMany = await listBackups();
    expect(afterMany.length).toBe(RETENTION_COUNT);
  });

  it("restores the DB and uploads from a backup, preserving the pre-restore state", async () => {
    const { getDb, closeDb } = await import("@/db/client");
    const { runBackup, restoreBackup } = await import("./index");

    getDb()
      .prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`)
      .run("original-user", "original.test", "Original", "basic_user");
    await writeFile(path.join(process.env.UPLOADS_DIR!, "original.txt"), "original content");

    const meta = await runBackup();
    expect(meta.status).toBe("success");

    // Mutate state after the backup was taken.
    getDb()
      .prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`)
      .run("post-backup-user", "post.test", "Post", "basic_user");
    await writeFile(path.join(process.env.UPLOADS_DIR!, "post-backup.txt"), "should disappear on restore");

    await restoreBackup(meta.id);

    const { getDb: getDbAfterRestore } = await import("@/db/client");
    const users = getDbAfterRestore().prepare(`SELECT username FROM users`).all() as { username: string }[];
    const usernames = users.map((u) => u.username);
    expect(usernames).toContain("original.test");
    expect(usernames).not.toContain("post.test");

    expect(fs.existsSync(path.join(process.env.UPLOADS_DIR!, "original.txt"))).toBe(true);
    expect(fs.existsSync(path.join(process.env.UPLOADS_DIR!, "post-backup.txt"))).toBe(false);

    const preRestoreDirs = fs
      .readdirSync(process.env.BACKUP_DIR!)
      .filter((name) => name.startsWith("pre-restore-"));
    expect(preRestoreDirs.length).toBeGreaterThan(0);
  });

  it("resolves with status \"failed\" and records a backup_failed security event when the backup directory can't be created", async () => {
    const { getDb } = await import("@/db/client");
    const { runBackup } = await import("./index");

    // A plain file sitting where BACKUP_DIR should be a directory forces
    // mkdir(dir, { recursive: true }) to fail for any sub-path under it —
    // exercises both the mkdir-outside-the-try bug and the inner empty-catch
    // bug fixed together (the failure meta.json write below also fails,
    // since its parent directory doesn't exist either).
    const originalBackupDir = process.env.BACKUP_DIR;
    const blockingFilePath = path.join(tmpRoot, "backup-dir-blocked-by-a-file");
    await writeFile(blockingFilePath, "not a directory");
    process.env.BACKUP_DIR = blockingFilePath;

    try {
      const meta = await runBackup("dad");
      expect(meta.status).toBe("failed");
      expect(meta.error).toBeTruthy();

      const events = getDb()
        .prepare(`SELECT user_id, detail FROM security_events WHERE type = 'backup_failed' ORDER BY created_at DESC LIMIT 1`)
        .all() as { user_id: string; detail: string }[];
      expect(events.length).toBe(1);
      expect(events[0]!.user_id).toBe("dad");
      expect(JSON.parse(events[0]!.detail).backupId).toBe(meta.id);
    } finally {
      process.env.BACKUP_DIR = originalBackupDir;
    }
  });
});
