// Requests the actual bytes for a connector-sourced photo that's still
// metadata-only. See documents' equivalent route for the full rationale.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser } from "@/lib/core/permissions";
import { requestFile } from "@/lib/core/connectors";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface PhotoRow {
  id: string;
  uploaded_by: string;
  visibility: "public" | "private";
  sync_status: "local" | "metadata_only" | "fetched";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const row = getDb().prepare(`SELECT id, uploaded_by, visibility, sync_status FROM photos WHERE id = ?`).get(id) as
    | PhotoRow
    | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such photo.", 404);

  if (row.visibility !== "public" && !canManageUser(actor, row.uploaded_by)) {
    return errorResponse("FORBIDDEN", "You don't have access to this photo.", 403);
  }
  if (row.sync_status !== "metadata_only") {
    return errorResponse("INVALID_STATE", "This photo isn't pending a fetch.", 409);
  }

  requestFile("photo", id);
  return NextResponse.json({ id, requested: true });
}
