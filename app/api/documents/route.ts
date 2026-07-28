// Documents API. See docs/02_Modules/Documents.md and
// docs/01_System_Architecture/API_Reference.md for the conventions this
// follows. Upload requires folder Edit access; view/download requires
// folder View access — both via lib/core/permissions/canAccessFolder.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser, canAccessFolder } from "@/lib/core/permissions";
import { getDefaultFolderId } from "@/lib/folders/default-folder";
import { saveUploadedFile } from "@/lib/storage/files";
import { indexContent } from "@/lib/core/search";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface DocumentRow {
  id: string;
  file: string;
  title: string;
  folder_id: string | null;
  category: string | null;
  is_sensitive: number;
  uploaded_by: string;
  uploaded_at: string;
  sync_status: "local" | "metadata_only" | "fetched";
  file_requested_at: string | null;
  removed_from_source_at: string | null;
  source_device_id: string | null;
}

function toDocResponse(row: DocumentRow, canDelete: boolean) {
  return {
    id: row.id,
    title: row.title,
    folderId: row.folder_id,
    category: row.category,
    isSensitive: !!row.is_sensitive,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    canDelete,
    // Connector-sourced state (File_Connector_Architecture.md) — 'local' for
    // everything uploaded directly, which is most documents.
    syncStatus: row.sync_status,
    fileRequestedAt: row.file_requested_at,
    removedFromSourceAt: row.removed_from_source_at,
    sourceDeviceId: row.source_device_id,
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const rows = getDb().prepare(`SELECT * FROM documents ORDER BY uploaded_at DESC`).all() as DocumentRow[];

  const visible: typeof rows = [];
  for (const row of rows) {
    if (row.folder_id && (await canAccessFolder({ userId: actor.id }, row.folder_id, "view"))) {
      visible.push(row);
    }
  }

  const withPermissions = await Promise.all(
    visible.map(async (row) => {
      const canDelete = row.folder_id
        ? await canAccessFolder({ userId: actor.id }, row.folder_id, "delete")
        : false;
      return toDocResponse(row, canDelete);
    })
  );

  return NextResponse.json(withPermissions);
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const folderId = getDefaultFolderId(db);
  if (!folderId) return errorResponse("NO_FOLDER", "No folder exists to upload into yet.", 500);

  if (!(await canAccessFolder({ userId: actorId }, folderId, "edit"))) {
    return errorResponse("FORBIDDEN", "You don't have Edit access to this folder.", 403);
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  const title = formData?.get("title");
  const category = formData?.get("category");
  const isSensitive = formData?.get("isSensitive") === "true";

  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("INVALID_INPUT", "A file is required.", 400);
  }
  if (typeof title !== "string" || !title.trim()) {
    return errorResponse("INVALID_INPUT", "A title is required.", 400);
  }

  const storedPath = await saveUploadedFile("documents", file);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO documents (id, file, title, folder_id, category, is_sensitive, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, storedPath, title.trim(), folderId, typeof category === "string" ? category : null, isSensitive ? 1 : 0, actorId);

  const row = db.prepare(`SELECT * FROM documents WHERE id = ?`).get(id) as DocumentRow;
  // Search.md: title/category are the fields Documents indexes for cross-content search.
  indexContent("document", id, `${row.title} ${row.category ?? ""}`).catch((err) => console.error("[search] Failed to index document:", err));
  return NextResponse.json(toDocResponse(row, true), { status: 201 });
}
