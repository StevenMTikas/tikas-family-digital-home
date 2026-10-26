// Removes the temporary connector_debug_logs table. It existed only to verify
// that a push-triggered location refresh wakes a real phone (done
// 2026-10-26: a push woke the phone from 33 minutes of unplugged idle in ~3s),
// and was always documented as temporary. A fresh `npm run db:init` no longer
// creates it; this only brings an existing tikas.db up to match.
//
// Idempotent — safe to re-run.
// Run with: node scripts/migrations/2026-10-drop-connector-debug-log.js

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "db", "tikas.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const exists = !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'connector_debug_logs'`).get();
if (!exists) {
  console.log("connector_debug_logs already gone — skipping.");
} else {
  const rows = db.prepare(`SELECT COUNT(*) AS n FROM connector_debug_logs`).get().n;
  db.exec(`DROP INDEX IF EXISTS idx_connector_debug_logs_created_at; DROP TABLE connector_debug_logs;`);
  console.log(`Dropped connector_debug_logs (${rows} diagnostic rows discarded).`);
}

console.log("Migration complete.");
db.close();
