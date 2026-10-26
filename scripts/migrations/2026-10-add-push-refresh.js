// Push-on-demand location refresh (Location_Tracking.md): adds the phone's
// FCM token + rate-limit timestamp to devices, and a `source` tag to
// location_reports. A fresh `npm run db:init` already produces this end state
// from db/schema.sql; this only brings an existing tikas.db up to match.
//
// Idempotent — safe to re-run.
// Run with: node scripts/migrations/2026-10-add-push-refresh.js

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "db", "tikas.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

function columnExists(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}

function addColumn(table, column, ddl) {
  if (columnExists(table, column)) {
    console.log(`${table}.${column} already exists — skipping.`);
  } else {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl};`);
    console.log(`Added ${table}.${column}.`);
  }
}

addColumn("devices", "push_token", "TEXT");
addColumn("devices", "last_refresh_push_at", "TEXT");
addColumn("location_reports", "source", "TEXT CHECK (source IN ('push_refresh', 'foreground', 'heartbeat'))");

console.log("Migration complete.");
db.close();
