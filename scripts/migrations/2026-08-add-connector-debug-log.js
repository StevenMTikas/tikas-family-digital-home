// TEMPORARY diagnostic table for verifying the push-triggered location
// refresh on a real phone — see db/schema.sql's comment on
// connector_debug_logs and mobile-connector/src/debug-log.ts for when to drop
// it (and this migration).
//
// Idempotent — safe to re-run.
// Run with: node scripts/migrations/2026-08-add-connector-debug-log.js

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "db", "tikas.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function tableExists(name) {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

if (tableExists("connector_debug_logs")) {
  console.log("connector_debug_logs already exists — skipping.");
} else {
  db.exec(`
    CREATE TABLE connector_debug_logs (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id),
      event_type TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_connector_debug_logs_created_at ON connector_debug_logs(created_at);
  `);
  console.log("Created connector_debug_logs.");
}

console.log("Migration complete.");
db.close();
