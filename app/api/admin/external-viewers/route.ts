// External Viewer accounts API — Super-Admin-only. A parallel flow to
// POST /api/users rather than a 4th option on that form/endpoint: this role
// skips calendar-color assignment, relationship/DOB, and every other
// family-roster concern, and grants Photos access through the existing
// Folder Permissions tab (unchanged) rather than anything here. See
// docs/04_Permissions/Authorization.md's External Viewer section.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { logSecurityEvent } from "@/lib/core/logging";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface ExternalViewerRow {
  id: string;
  username: string;
  full_name: string;
  view_family_board: number;
  created_at: string;
}

function toResponse(row: ExternalViewerRow) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    boardAccess: !!row.view_family_board,
    createdAt: row.created_at,
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can manage External Viewers.", 403);
  }

  const rows = getDb()
    .prepare(
      `SELECT id, username, full_name, view_family_board, created_at FROM users
       WHERE role = 'external_viewer' ORDER BY created_at DESC`
    )
    .all() as ExternalViewerRow[];

  return NextResponse.json(rows.map(toResponse));
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can invite an External Viewer.", 403);
  }

  const body = await req.json().catch(() => null);
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const boardAccess = body?.boardAccess === true;

  if (!fullName || !username || !password) {
    return errorResponse("INVALID_INPUT", "Full name, username, and password are required.", 400);
  }

  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return errorResponse("USERNAME_TAKEN", "That username is already in use.", 409);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, ai_enabled, view_family_board)
     VALUES (?, ?, ?, ?, 'external_viewer', 0, ?)`
  ).run(id, username, bcrypt.hashSync(password, 10), fullName, boardAccess ? 1 : 0);

  await logSecurityEvent({
    type: "permission_changed",
    userId: actor.id,
    detail: { scope: "external_viewer", action: "created", externalViewerId: id, boardAccess },
  });

  const row = db
    .prepare(`SELECT id, username, full_name, view_family_board, created_at FROM users WHERE id = ?`)
    .get(id) as ExternalViewerRow;

  return NextResponse.json(toResponse(row), { status: 201 });
}
