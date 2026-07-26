// Initializes the SQLite database from schema.sql.
// Run with: npm run db:init
// See docs/01_System_Architecture/Data_Model.md for the entity definitions
// this schema implements, and docs/01_System_Architecture/Decision_Log.md
// entry #003 for why SQLite was chosen for MVP.

const Database = require("better-sqlite3");
const sqliteVec = require("sqlite-vec");
const fs = require("fs");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "tikas.db");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
const db = new Database(DB_PATH);

// WAL mode per Data_Model.md's note on mitigating SQLite's single-writer
// lock (Decision_Log.md #003) — short transactions, WAL mode, monitor for
// contention before considering a Postgres migration.
db.pragma("journal_mode = WAL");

// Must load before exec(schema) — schema.sql's CREATE VIRTUAL TABLE ... USING
// vec0(...) statement needs the module registered first (Search.md).
sqliteVec.load(db);

db.exec(schema);

console.log(`Database initialized at ${DB_PATH}`);
db.close();
