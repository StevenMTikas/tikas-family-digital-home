// Requests the actual bytes for a connector-sourced document that's still
// metadata-only. See File_Connector_Architecture.md: "pulled on demand, only
// when a family member actually opens/requests that specific file" — this is
// that request. The source device's connector picks it up on its next
// pending-requests poll, not instantly.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canAccessFolder } from "@/lib/core/permissions";
import { requestFile } from "@/lib/core/connectors";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface DocumentRow {
  id: string;
  folder_id: string | null;
  sync_status: "local" | "metadata_only" | "fetched";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const row = getDb().prepare(`SELECT id, folder_id, sync_status FROM documents WHERE id = ?`).get(id) as
    | DocumentRow
    | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such document.", 404);

  if (!row.folder_id || !(await canAccessFolder({ userId: actor.id }, row.folder_id, "view"))) {
    return errorResponse("FORBIDDEN", "You don't have View access to this document's folder.", 403);
  }
  if (row.sync_status !== "metadata_only") {
    return errorResponse("INVALID_STATE", "This document isn't pending a fetch.", 409);
  }

  requestFile("document", id);
  return NextResponse.json({ id, requested: true });
}
