// Single-user API. See docs/02_Modules/Users.md's self-editable vs.
// admin-only field split, and docs/04_Permissions/Authorization.md.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

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

// Per Users.md: full_name, photo, contact_info, hobbies_interests are
// self-editable by anyone about themselves; everything else needs an admin
// and goes through Administration instead, not this route.
const SELF_EDITABLE_FIELDS = ["fullName", "photo", "contactInfo", "hobbiesInterests"] as const;
type SelfEditableField = (typeof SELF_EDITABLE_FIELDS)[number];

interface UserPatch {
  full_name?: string;
  photo?: string | null;
  contact_info?: string | null;
  hobbies_interests?: string | null;
}

/** Filters an arbitrary request body down to only the self-editable fields, mapped to column names. */
export function pickSelfEditableFields(body: unknown): UserPatch {
  const patch: UserPatch = {};
  if (typeof body !== "object" || body === null) return patch;
  const b = body as Partial<Record<SelfEditableField, unknown>>;

  if (typeof b.fullName === "string" && b.fullName.trim()) patch.full_name = b.fullName.trim();
  if (typeof b.photo === "string" || b.photo === null) patch.photo = b.photo;
  if (typeof b.contactInfo === "string" || b.contactInfo === null) patch.contact_info = b.contactInfo;
  if (Array.isArray(b.hobbiesInterests)) patch.hobbies_interests = JSON.stringify(b.hobbiesInterests);

  return patch;
}

function toResponseShape(row: UserRow, includeAdminOnly: boolean) {
  const base = {
    id: row.id,
    fullName: row.full_name,
    photo: row.photo,
    contactInfo: row.contact_info,
    hobbiesInterests: row.hobbies_interests ? JSON.parse(row.hobbies_interests) : [],
  };
  if (!includeAdminOnly) return base;
  return {
    ...base,
    username: row.username,
    role: row.role,
    relationship: row.relationship,
    dateOfBirth: row.date_of_birth,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const row = getDb()
    .prepare(
      `SELECT id, username, full_name, photo, contact_info, hobbies_interests, relationship, date_of_birth, role
       FROM users WHERE id = ?`
    )
    .get(id) as UserRow | undefined;

  if (!row) return errorResponse("NOT_FOUND", "No such user.", 404);

  return NextResponse.json(toResponseShape(row, canManageUser(actor, id)));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  // Per Users.md, this route only covers self-editing — an admin changing
  // someone else's account goes through Administration instead.
  if (actor.id !== id) {
    return errorResponse("FORBIDDEN", "You can only edit your own profile here.", 403);
  }

  const body = await req.json().catch(() => null);
  const patch = pickSelfEditableFields(body);
  const fields = Object.keys(patch);
  if (fields.length === 0) {
    return errorResponse("INVALID_INPUT", "No editable fields provided.", 400);
  }

  const db = getDb();
  const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`).run({ ...patch, id });

  const row = db
    .prepare(
      `SELECT id, username, full_name, photo, contact_info, hobbies_interests, relationship, date_of_birth, role
       FROM users WHERE id = ?`
    )
    .get(id) as UserRow;

  return NextResponse.json(toResponseShape(row, true));
}
