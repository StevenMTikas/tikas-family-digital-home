// Serves a photo's actual bytes for inline <img> display, gated on the same
// visibility rule as the list endpoint — photos are never in a public/
// static path specifically so this check can't be bypassed.

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { readUploadedFile } from "@/lib/storage/files";
import { isPhotoVisibleTo } from "@/lib/photos/visibility";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
};

interface PhotoRow {
  id: string;
  file: string;
  uploaded_by: string;
  visibility: "public" | "private";
  is_sensitive: number;
  folder_id: string | null;
  sync_status: "local" | "metadata_only" | "fetched";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const row = getDb()
    .prepare(`SELECT id, file, uploaded_by, visibility, is_sensitive, folder_id, sync_status FROM photos WHERE id = ?`)
    .get(id) as PhotoRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such photo.", 404);

  if (!(await isPhotoVisibleTo(actor, row))) {
    return errorResponse("FORBIDDEN", "You don't have access to this photo.", 403);
  }

  // Connector-sourced photo whose full bytes haven't arrived yet — the
  // client renders the metadata's `thumbnail` instead until then (see
  // File_Connector_Architecture.md and the request-file route).
  if (row.sync_status === "metadata_only") {
    return errorResponse("NOT_FETCHED", "This photo hasn't been pulled from the source device yet.", 409);
  }

  const buffer = await readUploadedFile(row.file);
  const contentType = CONTENT_TYPES[path.extname(row.file).toLowerCase()] ?? "application/octet-stream";
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": contentType } });
}
