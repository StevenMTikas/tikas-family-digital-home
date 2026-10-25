// Adds the missing index on security_events.type — the admin Logs screen
// (app/api/admin/logs/route.ts) filters by type but this column was never
// indexed (only user_id and created_at were). Idempotent — safe to re-run.
// Run with: node scripts/migrations/2026-08-add-security-events-type-index.js

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "db", "tikas.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

function indexExists(name) {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`).get(name);
}

if (indexExists("idx_security_events_type")) {
  console.log("idx_security_events_type already exists — skipping.");
} else {
  db.exec(`CREATE INDEX idx_security_events_type ON security_events(type);`);
  console.log("Created idx_security_events_type.");
}

console.log("Migration complete.");
db.close();
