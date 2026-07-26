// Password Entries API. See docs/02_Modules/Family_Knowledge.md: structured
// credential fields (not free text), always sensitive, "masked by default,
// revealed on request" — the list here never includes the decrypted
// password; GET .../passwords/:id does, fetched lazily only when the user
// actually asks to reveal it.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser, canAccessFolder } from "@/lib/core/permissions";
import { getDefaultFolderId } from "@/lib/folders/default-folder";
import { encryptSecret } from "@/lib/crypto/secret-box";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface PasswordRow {
  id: string;
  service_name: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  folder_id: string | null;
  created_by: string;
  updated_at: string;
}

function toMaskedResponse(row: PasswordRow, canEdit: boolean, canDelete: boolean) {
  return {
    id: row.id,
    serviceName: row.service_name,
    username: row.username,
    url: row.url,
    notes: row.notes,
    folderId: row.folder_id,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    isSensitive: true,
    canEdit,
    canDelete,
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const rows = getDb()
    .prepare(`SELECT id, service_name, username, url, notes, folder_id, created_by, updated_at FROM password_entries ORDER BY service_name`)
    .all() as PasswordRow[];

  const result = [];
  for (const row of rows) {
    if (!row.folder_id) continue;
    const ctx = { userId: actor.id };
    if (!(await canAccessFolder(ctx, row.folder_id, "view"))) continue;
    const canEdit = await canAccessFolder(ctx, row.folder_id, "edit");
    const canDelete = await canAccessFolder(ctx, row.folder_id, "delete");
    result.push(toMaskedResponse(row, canEdit, canDelete));
  }

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const folderId = getDefaultFolderId(db);
  if (!folderId) return errorResponse("NO_FOLDER", "No folder exists to create this in yet.", 500);

  if (!(await canAccessFolder({ userId: actorId }, folderId, "edit"))) {
    return errorResponse("FORBIDDEN", "You don't have Edit access to this folder.", 403);
  }

  const body = await req.json().catch(() => null);
  const serviceName = typeof body?.serviceName === "string" ? body.serviceName.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim() || null : null;
  const password = typeof body?.password === "string" ? body.password : "";
  const url = typeof body?.url === "string" ? body.url.trim() || null : null;
  const notes = typeof body?.notes === "string" ? body.notes.trim() || null : null;

  if (!serviceName || !password) {
    return errorResponse("INVALID_INPUT", "Service name and password are required.", 400);
  }

  const id = randomUUID();
  // is_sensitive is always 1 — Password Entries are never allowed to be
  // anything else, per Family_Knowledge.md.
  db.prepare(
    `INSERT INTO password_entries (id, service_name, username, password, url, notes, folder_id, is_sensitive, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(id, serviceName, username, encryptSecret(password), url, notes, folderId, actorId);

  const row = db
    .prepare(`SELECT id, service_name, username, url, notes, folder_id, created_by, updated_at FROM password_entries WHERE id = ?`)
    .get(id) as PasswordRow;
  return NextResponse.json(toMaskedResponse(row, true, true), { status: 201 });
}
