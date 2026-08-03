// One-off migration for the External Family Viewer feature — applies to an
// already-running dev DB that predates the external_viewer role. A fresh
// `npm run db:init && npm run db:seed` already produces this exact end state
// directly from db/schema.sql/db/seed.js; this script exists only to bring
// an existing tikas.db up to match, without losing data.
//
// Idempotent — safe to re-run; each step checks whether it's already done.
// Run with: node scripts/migrations/2026-08-add-external-viewer.js

const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "db", "tikas.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

function hasColumn(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}

function tableExists(name) {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

// ── 1. Rebuild users: widen role CHECK to include 'external_viewer', add
//      view_family_board. SQLite can't ALTER a CHECK constraint in place. ──
if (hasColumn("users", "view_family_board")) {
  console.log("users.view_family_board already exists — users rebuild already applied, skipping.");
} else {
  console.log("Rebuilding users table (widen role CHECK, add view_family_board)...");
  db.pragma("foreign_keys = OFF");
  const rebuildUsers = db.transaction(() => {
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        relationship TEXT,
        date_of_birth TEXT,
        photo TEXT,
        contact_info TEXT,
        hobbies_interests TEXT,
        calendar_color TEXT,
        ai_enabled INTEGER NOT NULL DEFAULT 1,
        role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'basic_user', 'external_viewer')),
        admin_scope TEXT,
        approve_outside_calls INTEGER NOT NULL DEFAULT 0,
        manage_devices INTEGER NOT NULL DEFAULT 0,
        manage_parental_controls INTEGER NOT NULL DEFAULT 0,
        view_child_activity_logs INTEGER NOT NULL DEFAULT 0,
        delete_content INTEGER NOT NULL DEFAULT 0,
        manage_folder_permissions INTEGER NOT NULL DEFAULT 0,
        approve_sensitive_outside_transmission INTEGER NOT NULL DEFAULT 0,
        view_family_board INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      INSERT INTO users_new (
        id, username, password_hash, full_name, relationship, date_of_birth, photo,
        contact_info, hobbies_interests, calendar_color, ai_enabled, role, admin_scope,
        approve_outside_calls, manage_devices, manage_parental_controls,
        view_child_activity_logs, delete_content, manage_folder_permissions,
        approve_sensitive_outside_transmission, view_family_board, created_at
      )
      SELECT
        id, username, password_hash, full_name, relationship, date_of_birth, photo,
        contact_info, hobbies_interests, calendar_color, ai_enabled, role, admin_scope,
        approve_outside_calls, manage_devices, manage_parental_controls,
        view_child_activity_logs, delete_content, manage_folder_permissions,
        approve_sensitive_outside_transmission, 0, created_at
      FROM users;
    `);
    db.exec(`DROP TABLE users;`);
    db.exec(`ALTER TABLE users_new RENAME TO users;`);
  });
  rebuildUsers();
  const fkIssues = db.pragma("foreign_key_check");
  if (fkIssues.length > 0) {
    throw new Error(`Foreign key check failed after users rebuild: ${JSON.stringify(fkIssues)}`);
  }
  db.pragma("foreign_keys = ON");
  console.log("users table rebuilt.");
}

// ── 2. photos.folder_id ────────────────────────────────────────────────
if (hasColumn("photos", "folder_id")) {
  console.log("photos.folder_id already exists — skipping.");
} else {
  db.exec(`ALTER TABLE photos ADD COLUMN folder_id TEXT REFERENCES folders(id);`);
  console.log("Added photos.folder_id.");
}

// ── 3. folders.is_default_photos_folder ─────────────────────────────────
if (hasColumn("folders", "is_default_photos_folder")) {
  console.log("folders.is_default_photos_folder already exists — skipping.");
} else {
  db.exec(`ALTER TABLE folders ADD COLUMN is_default_photos_folder INTEGER NOT NULL DEFAULT 0;`);
  console.log("Added folders.is_default_photos_folder.");
}

// ── 4. family_board_posts table ──────────────────────────────────────────
if (tableExists("family_board_posts")) {
  console.log("family_board_posts already exists — skipping.");
} else {
  db.exec(`
    CREATE TABLE family_board_posts (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      posted_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  console.log("Created family_board_posts.");
}

// ── 5. Seed the "Family Photos" folder + backfill existing photos ───────
let photosFolderId = db.prepare(`SELECT id FROM folders WHERE is_default_photos_folder = 1`).get()?.id;
if (photosFolderId) {
  console.log("Default photos folder already exists — skipping seed.");
} else {
  const owner = db.prepare(`SELECT id FROM users WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1`).get();
  if (!owner) {
    console.warn("No super_admin user found yet — skipping 'Family Photos' folder seed (run again after Add User creates one).");
  } else {
    photosFolderId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO folders (id, name, owner_id, parent_folder_id, inherits_permissions, permissions, is_default_photos_folder)
       VALUES (?, ?, ?, NULL, 1, ?, 1)`
    ).run(
      photosFolderId,
      "Family Photos",
      owner.id,
      JSON.stringify({ roles: { super_admin: "delete", admin: "delete", basic_user: "view" } })
    );
    console.log(`Seeded "Family Photos" folder (${photosFolderId}).`);
  }
}

if (photosFolderId) {
  const result = db.prepare(`UPDATE photos SET folder_id = ? WHERE folder_id IS NULL`).run(photosFolderId);
  console.log(`Backfilled folder_id on ${result.changes} existing photo(s).`);
}

// ── 6. Indexes ────────────────────────────────────────────────────────
db.exec(`CREATE INDEX IF NOT EXISTS idx_photos_folder_id ON photos(folder_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_family_board_posts_posted_by ON family_board_posts(posted_by);`);

console.log("Migration complete.");
db.close();
