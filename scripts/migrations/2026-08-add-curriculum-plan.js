// One-off migration for the AI-Generated Curriculum Plan feature
// (Homeschool.md, 2026-08-23) — applies to an already-running dev DB that
// predates school_years/school_year_blackouts/curriculum_links/
// assignment_drafts. A fresh `npm run db:init` already produces this exact
// end state directly from db/schema.sql; this script exists only to bring
// an existing tikas.db up to match, without losing data.
//
// Idempotent — safe to re-run.
// Run with: node scripts/migrations/2026-08-add-curriculum-plan.js

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "db", "tikas.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function tableExists(name) {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

const tables = [
  {
    name: "school_years",
    sql: `
      CREATE TABLE school_years (
        id TEXT PRIMARY KEY,
        child_id TEXT NOT NULL REFERENCES users(id),
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_by TEXT NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    name: "school_year_blackouts",
    sql: `
      CREATE TABLE school_year_blackouts (
        id TEXT PRIMARY KEY,
        school_year_id TEXT NOT NULL REFERENCES school_years(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL
      );
    `,
  },
  {
    name: "curriculum_links",
    sql: `
      CREATE TABLE curriculum_links (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL REFERENCES subjects(id),
        url TEXT NOT NULL,
        label TEXT,
        added_by TEXT NOT NULL REFERENCES users(id),
        added_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    name: "assignment_drafts",
    sql: `
      CREATE TABLE assignment_drafts (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL REFERENCES subjects(id),
        child_id TEXT NOT NULL REFERENCES users(id),
        generation_batch_id TEXT NOT NULL,
        title TEXT NOT NULL,
        curriculum_reference TEXT,
        suggested_due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
        approved_task_id TEXT REFERENCES tasks(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
];

for (const table of tables) {
  if (tableExists(table.name)) {
    console.log(`${table.name} already exists — skipping.`);
  } else {
    db.exec(table.sql);
    console.log(`Created ${table.name}.`);
  }
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_school_years_child_id ON school_years(child_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_school_year_blackouts_school_year_id ON school_year_blackouts(school_year_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_curriculum_links_subject_id ON curriculum_links(subject_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_assignment_drafts_subject_id ON assignment_drafts(subject_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_assignment_drafts_child_id ON assignment_drafts(child_id);`);

console.log("Migration complete.");
db.close();
