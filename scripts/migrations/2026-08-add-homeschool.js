// One-off migration for the Homeschool module (Phase 9, Homeschool.md) —
// applies to an already-running dev DB that predates the subjects/
// homework_details tables. A fresh `npm run db:init` already produces this
// exact end state directly from db/schema.sql; this script exists only to
// bring an existing tikas.db up to match, without losing data.
//
// Idempotent — safe to re-run.
// Run with: node scripts/migrations/2026-08-add-homeschool.js

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "db", "tikas.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function tableExists(name) {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

if (tableExists("subjects")) {
  console.log("subjects already exists — skipping.");
} else {
  db.exec(`
    CREATE TABLE subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  console.log("Created subjects.");
}

if (tableExists("homework_details")) {
  console.log("homework_details already exists — skipping.");
} else {
  db.exec(`
    CREATE TABLE homework_details (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id),
      curriculum_reference TEXT,
      grade_or_score TEXT,
      parent_notes TEXT,
      signed_off_by TEXT REFERENCES users(id),
      signed_off_at TEXT
    );
  `);
  console.log("Created homework_details.");
}

console.log("Migration complete.");
db.close();
