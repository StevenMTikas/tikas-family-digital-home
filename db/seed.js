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

const dadId = upsertUser({
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

// A couple of dev-only devices for Dad so "My Devices" (Users.md) has
// something to show — real devices come from the Phase 5 pairing flow.
const existingDevice = db.prepare("SELECT id FROM devices WHERE user_id = ?").get(dadId);
if (existingDevice) {
  console.log("Dad already has seeded devices — nothing to do.");
} else {
  const insertDevice = db.prepare(
    `INSERT INTO devices (id, user_id, device_type, device_name, status, added_by)
     VALUES (?, ?, ?, ?, 'trusted', ?)`
  );
  insertDevice.run(crypto.randomUUID(), dadId, "phone", "Dad's Phone", dadId);
  insertDevice.run(crypto.randomUUID(), dadId, "computer", "Family Room Tablet", dadId);
  console.log("Seeded 2 dev devices for Dad.");
}

// The one deliberate default-shared exception per Folder_Permissions.md —
// "not everything requires manual setup from day one." Admins get full
// control, Basic Users get View only (the doc's own suggested default).
const existingSharedFolder = db.prepare("SELECT id FROM folders WHERE is_shared_family_folder = 1").get();
if (existingSharedFolder) {
  console.log("Shared family folder already exists — nothing to do.");
} else {
  db.prepare(
    `INSERT INTO folders (id, name, owner_id, parent_folder_id, inherits_permissions, permissions, is_shared_family_folder)
     VALUES (?, ?, ?, NULL, 1, ?, 1)`
  ).run(
    crypto.randomUUID(),
    "Whole Family",
    dadId,
    JSON.stringify({ roles: { super_admin: "delete", admin: "delete", basic_user: "view" } })
  );
  console.log('Seeded shared "Whole Family" folder.');
}

db.close();
