// Users API. See docs/02_Modules/Users.md and
// docs/01_System_Architecture/API_Reference.md for the conventions this
// should follow (standard REST, shared error shape, permission checks via
// /lib/core/permissions before any action).

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { assignNextCalendarColor } from "@/lib/calendar/colors";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export interface PublicFamilyMember {
  id: string;
  fullName: string;
  photo: string | null;
  relationship: string | null;
  hobbiesInterests: string[];
  role: string;
}

interface PublicUserRow {
  id: string;
  full_name: string;
  photo: string | null;
  relationship: string | null;
  hobbies_interests: string | null;
  role: string;
}

// "Family visibility" per Users.md — every family member can see this much
// about every other member, with no folder or permission gate. Excludes
// external_viewer rows (2026-08) — they're a different kind of account,
// managed from Administration's External Viewers tab, and shouldn't appear
// in the general "who's who" roster this feeds (Calendar/Task assignment
// pickers, the Users page family grid).
export async function GET() {
  const rows = getDb()
    .prepare(`SELECT id, full_name, photo, relationship, hobbies_interests, role FROM users WHERE role != 'external_viewer'`)
    .all() as PublicUserRow[];

  const members: PublicFamilyMember[] = rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    photo: row.photo,
    relationship: row.relationship,
    hobbiesInterests: row.hobbies_interests ? JSON.parse(row.hobbies_interests) : [],
    role: row.role,
  }));

  return NextResponse.json(members);
}

export async function POST(req: NextRequest) {
  // Add User is inherently Super-Admin-only (role/scope assignment is not an
  // individually grantable permission) — see Authorization.md.
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can add a new user.", 403);
  }

  const body = await req.json().catch(() => null);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const relationship = typeof body?.relationship === "string" ? body.relationship.trim() : null;
  const dateOfBirth = typeof body?.dateOfBirth === "string" ? body.dateOfBirth : null;
  const role = body?.role;

  if (!fullName || !username || !password) {
    return errorResponse("INVALID_INPUT", "Full name, username, and password are required.", 400);
  }
  if (role !== "super_admin" && role !== "admin" && role !== "basic_user") {
    return errorResponse("INVALID_INPUT", "Role must be super_admin, admin, or basic_user.", 400);
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return errorResponse("USERNAME_TAKEN", "That username is already in use.", 409);
  }

  const id = randomUUID();
  // Auto-assigned from the calendar color palette — see Calendar.md: "New
  // family members added later are assigned a color automatically."
  const calendarColor = assignNextCalendarColor(db);
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, relationship, date_of_birth, role, calendar_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, username, bcrypt.hashSync(password, 10), fullName, relationship, dateOfBirth, role, calendarColor);

  return NextResponse.json({ id, username, fullName, role }, { status: 201 });
}
