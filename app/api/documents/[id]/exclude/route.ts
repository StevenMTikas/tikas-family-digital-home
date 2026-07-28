// "Don't sync this again" for a connector-synced document — deletes it like
// the normal DELETE route, but also remembers the source path so
// applySyncBatch won't silently re-report it next time the source device
// syncs (it still has the file; deleting the row alone doesn't stop that).
// See lib/core/connectors's excludeSourcePath and File_Connector_Architecture.md.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canAccessFolder } from "@/lib/core/permissions";
import { deleteUploadedFile } from "@/lib/storage/files";
import { removeFromIndex } from "@/lib/core/search";
import { excludeSourcePath } from "@/lib/core/connectors";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface DocumentRow {
  id: string;
  file: string;
  folder_id: string | null;
  source_device_id: string | null;
  source_path: string | null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db
    .prepare(`SELECT id, file, folder_id, source_device_id, source_path FROM documents WHERE id = ?`)
    .get(id) as DocumentRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such document.", 404);

  if (!row.folder_id || !(await canAccessFolder({ userId: actorId! }, row.folder_id, "delete"))) {
    return errorResponse("FORBIDDEN", "You don't have Delete access to this document's folder.", 403);
  }
  if (!row.source_device_id || !row.source_path) {
    return errorResponse("INVALID_STATE", "This document wasn't synced from a connector — there's nothing to exclude.", 400);
  }

  excludeSourcePath(row.source_device_id, row.source_path);
  db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
  await deleteUploadedFile(row.file);
  removeFromIndex("document", id);

  return new NextResponse(null, { status: 204 });
}
