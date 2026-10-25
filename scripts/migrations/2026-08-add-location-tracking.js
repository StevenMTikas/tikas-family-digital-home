// One-off migration for the Location Tracking module (Location_Tracking.md)
// — applies to an already-running dev DB that predates location_reports and
// users.location_sharing_enabled. A fresh `npm run db:init` already produces
// this exact end state directly from db/schema.sql; this script exists only
// to bring an existing tikas.db up to match, without losing data.
//
// Idempotent — safe to re-run.
// Run with: node scripts/migrations/2026-08-add-location-tracking.js

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "db", "tikas.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function tableExists(name) {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

function columnExists(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}

if (columnExists("users", "location_sharing_enabled")) {
  console.log("users.location_sharing_enabled already exists — skipping.");
} else {
  db.exec(`ALTER TABLE users ADD COLUMN location_sharing_enabled INTEGER NOT NULL DEFAULT 1;`);
  console.log("Added users.location_sharing_enabled.");
}

if (tableExists("location_reports")) {
  console.log("location_reports already exists — skipping.");
} else {
  db.exec(`
    CREATE TABLE location_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      device_id TEXT NOT NULL REFERENCES devices(id),
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy_m REAL,
      recorded_at TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_location_reports_user_time ON location_reports(user_id, recorded_at DESC);
    CREATE INDEX idx_location_reports_received_at ON location_reports(received_at);
  `);
  console.log("Created location_reports.");
}

console.log("Migration complete.");
db.close();
