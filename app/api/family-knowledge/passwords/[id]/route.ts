// Single Password Entry API. GET includes the decrypted password (the
// user's explicit "reveal" action) — requires folder View access, same
// gate as everything else here. PATCH/DELETE require folder Edit/Delete.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canAccessFolder } from "@/lib/core/permissions";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import { indexContent, removeFromIndex } from "@/lib/core/search";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface PasswordRow {
  id: string;
  service_name: string;
  username: string | null;
  password: string;
  url: string | null;
  notes: string | null;
  folder_id: string | null;
  created_by: string;
  updated_at: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const row = getDb().prepare(`SELECT * FROM password_entries WHERE id = ?`).get(id) as PasswordRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such password entry.", 404);

  if (!row.folder_id || !(await canAccessFolder({ userId: actor.id }, row.folder_id, "view"))) {
    return errorResponse("FORBIDDEN", "You don't have View access to this entry's folder.", 403);
  }

  return NextResponse.json({
    id: row.id,
    serviceName: row.service_name,
    username: row.username,
    password: decryptSecret(row.password),
    url: row.url,
    notes: row.notes,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM password_entries WHERE id = ?`).get(id) as PasswordRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such password entry.", 404);

  if (!row.folder_id || !(await canAccessFolder({ userId: actor.id }, row.folder_id, "edit"))) {
    return errorResponse("FORBIDDEN", "You don't have Edit access to this entry's folder.", 403);
  }

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};
  if (typeof body?.serviceName === "string" && body.serviceName.trim()) updates.service_name = body.serviceName.trim();
  if (typeof body?.username === "string" || body?.username === null) updates.username = body.username;
  if (typeof body?.password === "string" && body.password) updates.password = encryptSecret(body.password);
  if (typeof body?.url === "string" || body?.url === null) updates.url = body.url;
  if (typeof body?.notes === "string" || body?.notes === null) updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return errorResponse("INVALID_INPUT", "No changes provided.", 400);
  }

  updates.updated_at = new Date().toISOString();
  const setClause = Object.keys(updates).map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE password_entries SET ${setClause} WHERE id = @id`).run({ ...updates, id });

  const updated = db.prepare(`SELECT id, service_name, username, url, notes, updated_at FROM password_entries WHERE id = ?`).get(id) as {
    service_name: string;
    url: string | null;
    notes: string | null;
  };
  indexContent("password", id, `${updated.service_name} ${updated.url ?? ""} ${updated.notes ?? ""}`).catch((err) =>
    console.error("[search] Failed to re-index password entry:", err)
  );
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT folder_id FROM password_entries WHERE id = ?`).get(id) as
    | { folder_id: string | null }
    | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such password entry.", 404);

  if (!row.folder_id || !(await canAccessFolder({ userId: actor.id }, row.folder_id, "delete"))) {
    return errorResponse("FORBIDDEN", "You don't have Delete access to this entry's folder.", 403);
  }

  db.prepare(`DELETE FROM password_entries WHERE id = ?`).run(id);
  removeFromIndex("password", id);
  return new NextResponse(null, { status: 204 });
}
