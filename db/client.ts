// Shared SQLite connection for API routes/core services, per
// Application_Architecture.md ("/db — SQLite schema, migrations, connection").
// Separate from db/init.js, which only builds the schema (run once via
// `npm run db:init`).

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "db", "tikas.db");

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  return db;
}
