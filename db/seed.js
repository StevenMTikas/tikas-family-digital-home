// Dev-only convenience seed: creates the initial Super Admin account so
// there's something to log in with before the Add User flow (Users.md)
// exists. Per Onboarding.md, the Super Admin is the first trusted identity
// on the host device — Vee and Malachi get added later through Add User,
// not seeded here.
// Run with: npm run db:seed
// CHANGE THIS PASSWORD after first login — it's a placeholder, not a secret.

const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "tikas.db");
const SEED_USERNAME = "dad.tikas";
const SEED_PASSWORD = "changeme123";

const db = new Database(DB_PATH);

const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(SEED_USERNAME);
if (existing) {
  console.log(`User "${SEED_USERNAME}" already exists — nothing to do.`);
} else {
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls, manage_devices, manage_parental_controls, view_child_activity_logs, delete_content, manage_folder_permissions, approve_sensitive_outside_transmission)
     VALUES (?, ?, ?, ?, 'super_admin', 1, 1, 1, 1, 1, 1, 1)`
  ).run(crypto.randomUUID(), SEED_USERNAME, bcrypt.hashSync(SEED_PASSWORD, 10), "Dad");

  console.log(`Seeded Super Admin: username="${SEED_USERNAME}" password="${SEED_PASSWORD}" — change this after first login.`);
}

db.close();
