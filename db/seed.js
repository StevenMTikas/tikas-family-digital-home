// Dev-only convenience seed: creates the household's three accounts so
// there's something to log in with and test role/scope authorization
// against, before the Add User flow (Users.md) exists. Per Onboarding.md,
// the Super Admin is the first trusted identity on the host device; Vee and
// Malachi mirror the real household described in MVP.md ("Who It's For").
// Run with: npm run db:seed
// CHANGE THESE PASSWORDS after first login — they're placeholders, not secrets.

const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "tikas.db");
const db = new Database(DB_PATH);

function upsertUser({ username, password, fullName, role, adminScope, permissions }) {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    console.log(`User "${username}" already exists — nothing to do.`);
    return existing.id;
  }

  const id = crypto.randomUUID();
  const p = permissions || {};
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, admin_scope,
       approve_outside_calls, manage_devices, manage_parental_controls,
       view_child_activity_logs, delete_content, manage_folder_permissions,
       approve_sensitive_outside_transmission)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    username,
    bcrypt.hashSync(password, 10),
    fullName,
    role,
    adminScope ? JSON.stringify(adminScope) : null,
    p.approveOutsideCalls ? 1 : 0,
    p.manageDevices ? 1 : 0,
    p.manageParentalControls ? 1 : 0,
    p.viewChildActivityLogs ? 1 : 0,
    p.deleteContent ? 1 : 0,
    p.manageFolderPermissions ? 1 : 0,
    p.approveSensitiveOutsideTransmission ? 1 : 0
  );

  console.log(`Seeded ${role}: username="${username}" password="${password}"`);
  return id;
}

const malachiId = upsertUser({
  username: "malachi.tikas",
  password: "changeme123",
  fullName: "Malachi",
  role: "basic_user",
});

upsertUser({
  username: "vee.tikas",
  password: "changeme123",
  fullName: "Vee",
  role: "admin",
  adminScope: [malachiId],
  permissions: {
    manageDevices: true,
    manageParentalControls: true,
    viewChildActivityLogs: true,
  },
});

upsertUser({
  username: "dad.tikas",
  password: "changeme123",
  fullName: "Dad",
  role: "super_admin",
  permissions: {
    approveOutsideCalls: true,
    manageDevices: true,
    manageParentalControls: true,
    viewChildActivityLogs: true,
    deleteContent: true,
    manageFolderPermissions: true,
    approveSensitiveOutsideTransmission: true,
  },
});

db.close();
