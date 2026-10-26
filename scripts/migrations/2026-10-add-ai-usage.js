// One-off migration for AI usage metering (lib/core/ai/usage.ts) — applies to
// an already-running dev DB that predates the ai_usage table. A fresh
// `npm run db:init` already produces this exact end state from db/schema.sql.
//
// Idempotent — safe to re-run.
// Run with: node scripts/migrations/2026-10-add-ai-usage.js

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "db", "tikas.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const exists = !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ai_usage'`).get();

if (exists) {
  console.log("ai_usage already exists — skipping.");
} else {
  db.exec(`
    CREATE TABLE ai_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      feature TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      latency_ms INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_ai_usage_created_at ON ai_usage(created_at);
    CREATE INDEX idx_ai_usage_user_id ON ai_usage(user_id);
  `);
  console.log("Created ai_usage.");
}

console.log("Migration complete.");
db.close();
