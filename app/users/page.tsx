// Users module. See docs/02_Modules/Users.md for the full spec: My Profile
// (self-edit + admin-only read-only fields), My Devices (read-only),
// Family Members (public "who's who"), Add User (Super Admin only).
//
// Initial data is fetched directly from the database here, per
// Application_Architecture.md ("Server Components handle most data fetching
// natively, directly from the database/API layer") — client-side actions
// (Save Changes, Create Account) go through /api/users via lib/api/users.ts.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { getViewableActivityTargets } from "@/lib/core/logging/activity";
import UsersPageClient, { type CurrentUser, type Device, type FamilyMember } from "./UsersPageClient";

interface UserRow {
  id: string;
  username: string;
  full_name: string;
  photo: string | null;
  contact_info: string | null;
  hobbies_interests: string | null;
  relationship: string | null;
  date_of_birth: string | null;
  role: string;
}

interface DeviceRow {
  id: string;
  device_type: string;
  device_name: string;
  status: string;
}

export default async function UsersPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");

  const db = getDb();

  const userRow = db
    .prepare(
      `SELECT id, username, full_name, photo, contact_info, hobbies_interests, relationship, date_of_birth, role
       FROM users WHERE id = ?`
    )
    .get(actor.id) as UserRow;

  const currentUser: CurrentUser = {
    id: userRow.id,
    username: userRow.username,
    fullName: userRow.full_name,
    photo: userRow.photo,
    contactInfo: userRow.contact_info,
    hobbiesInterests: userRow.hobbies_interests ? JSON.parse(userRow.hobbies_interests) : [],
    relationship: userRow.relationship,
    dateOfBirth: userRow.date_of_birth,
    role: userRow.role,
  };

  const deviceRows = db
    .prepare(`SELECT id, device_type, device_name, status FROM devices WHERE user_id = ?`)
    .all(actor.id) as DeviceRow[];

  const devices: Device[] = deviceRows.map((row) => ({
    id: row.id,
    type: row.device_type,
    name: row.device_name,
    status: row.status,
  }));

  const memberRows = db
    .prepare(`SELECT id, full_name, photo, relationship, hobbies_interests, role FROM users WHERE role != 'external_viewer'`)
    .all() as Pick<UserRow, "id" | "full_name" | "photo" | "relationship" | "hobbies_interests" | "role">[];

  const familyMembers: FamilyMember[] = memberRows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    photo: row.photo,
    relationship: row.relationship,
    hobbiesInterests: row.hobbies_interests ? JSON.parse(row.hobbies_interests) : [],
    role: row.role,
  }));

  return (
    <UsersPageClient
      currentUser={currentUser}
      devices={devices}
      familyMembers={familyMembers}
      isSuperAdmin={actor.role === "super_admin"}
      // Empty for anyone without view_child_activity_logs authority — the Activity tab is then not shown at all.
      activityTargets={getViewableActivityTargets(actor)}
    />
  );
}
