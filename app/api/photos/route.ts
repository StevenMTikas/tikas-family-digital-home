// Photos API. See docs/02_Modules/Photos.md: no folder requirement (unlike
// Documents), visibility governs viewing directly, upload requires no
// special permission, delete requires the delete_content permission.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, hasPermission, type AuthUser } from "@/lib/core/permissions";
import { saveUploadedFile } from "@/lib/storage/files";
import { indexContent } from "@/lib/core/search";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface PhotoRow {
  id: string;
  file: string;
  uploaded_by: string;
  uploaded_at: string;
  location: string | null;
  tags: string | null;
  visibility: "public" | "private";
  is_sensitive: number;
  event_link: string | null;
  sync_status: "local" | "metadata_only" | "fetched";
  file_requested_at: string | null;
  removed_from_source_at: string | null;
  thumbnail: string | null;
}

function toPhotoResponse(row: PhotoRow, actor: AuthUser) {
  return {
    id: row.id,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    location: row.location,
    tags: row.tags ? JSON.parse(row.tags) : [],
    visibility: row.visibility,
    isSensitive: !!row.is_sensitive,
    eventLink: row.event_link,
    canEditVisibility: canManageUser(actor, row.uploaded_by),
    // Delete requires the delete_content permission specifically (Photos.md)
    // — not the same gate as visibility, which any uploader/admin can change.
    canDelete: hasPermission(actor, "deleteContent"),
    // Connector-sourced state (File_Connector_Architecture.md) — 'local' for
    // everything uploaded directly, which is most photos. `thumbnail` lets a
    // metadata_only photo render something before the full file is fetched.
    syncStatus: row.sync_status,
    fileRequestedAt: row.file_requested_at,
    removedFromSourceAt: row.removed_from_source_at,
    thumbnail: row.thumbnail,
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const rows = getDb().prepare(`SELECT * FROM photos ORDER BY uploaded_at DESC`).all() as PhotoRow[];

  const visible = rows.filter(
    (row) => row.visibility === "public" || canManageUser(actor, row.uploaded_by)
  );

  return NextResponse.json(visible.map((row) => toPhotoResponse(row, actor)));
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const location = formData?.get("location");
  const tagsRaw = formData?.get("tags");
  const eventLink = formData?.get("eventLink");
  const visibility = formData?.get("visibility") === "private" ? "private" : "public";
  const isSensitive = formData?.get("isSensitive") === "true";

  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("INVALID_INPUT", "A photo file is required.", 400);
  }

  const tags = typeof tagsRaw === "string" && tagsRaw.trim()
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const storedPath = await saveUploadedFile("photos", file);
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO photos (id, file, uploaded_by, location, tags, visibility, is_sensitive, event_link)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    storedPath,
    actorId,
    typeof location === "string" && location.trim() ? location.trim() : null,
    tags.length > 0 ? JSON.stringify(tags) : null,
    visibility,
    isSensitive ? 1 : 0,
    typeof eventLink === "string" && eventLink ? eventLink : null
  );

  const row = db.prepare(`SELECT * FROM photos WHERE id = ?`).get(id) as PhotoRow;
  // Search.md: Photos have no title/content field — tags/location are what's indexed (Data_Model.md).
  const searchText = [...tags, row.location ?? ""].join(" ");
  indexContent("photo", id, searchText).catch((err) => console.error("[search] Failed to index photo:", err));
  return NextResponse.json(toPhotoResponse(row, actor), { status: 201 });
}
