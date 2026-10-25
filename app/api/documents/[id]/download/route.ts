// Download route. See Documents.md: "Download-only for MVP" — opening a
// document downloads it, gated on folder View access.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canAccessFolder } from "@/lib/core/permissions";
import { readUploadedFile } from "@/lib/storage/files";
import { logSecurityEvent } from "@/lib/core/logging";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface DocumentRow {
  id: string;
  file: string;
  title: string;
  folder_id: string | null;
  sync_status: "local" | "metadata_only" | "fetched";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const row = getDb().prepare(`SELECT id, file, title, folder_id, sync_status FROM documents WHERE id = ?`).get(id) as
    | DocumentRow
    | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such document.", 404);

  if (!row.folder_id || !(await canAccessFolder({ userId: actor.id }, row.folder_id, "view"))) {
    return errorResponse("FORBIDDEN", "You don't have View access to this document's folder.", 403);
  }

  // Connector-sourced document whose bytes haven't arrived yet — see
  // File_Connector_Architecture.md. The request-file route is what triggers
  // the fetch; this route only ever streams bytes that already exist.
  if (row.sync_status === "metadata_only") {
    return errorResponse("NOT_FETCHED", "This file hasn't been pulled from the source device yet.", 409);
  }

  await logSecurityEvent({ type: "document_downloaded", userId: actor.id, detail: { documentId: id, title: row.title } });

  const buffer = await readUploadedFile(row.file);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(row.title)}"`,
    },
  });
}
