// Shared SQLite connection for API routes/core services, per
// Application_Architecture.md ("/db — SQLite schema, migrations, connection").
// Separate from db/init.js, which only builds the schema (run once via
// `npm run db:init`).

import Database from "better-sqlite3";
import path from "path";

let db: Database.Database | undefined;

export function getDbPath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "db", "tikas.db");
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(getDbPath());
    db.pragma("journal_mode = WAL");
  }
  return db;
}

/**
 * Closes the current connection so the underlying file can be safely
 * replaced on disk (see lib/core/backup's restore path) — the next getDb()
 * call transparently reopens a fresh connection to whatever file is there.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined;
  }
}
