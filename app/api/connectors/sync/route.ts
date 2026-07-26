// Connector daily metadata sync. See docs/01_System_Architecture/
// File_Connector_Architecture.md's Data Flow — the connector reports
// metadata only (no file bytes) for everything currently in its designated
// folders; the host diffs this against what it already has for that device.
//
// Deliberately separate from the main module API pattern (see middleware.ts)
// — a connector isn't a logged-in family member, so it authenticates with
// its own device id + token instead of a session cookie.

import { NextRequest, NextResponse } from "next/server";
import { applySyncBatch, FOLDER_TYPES, type SyncItem, type FolderType } from "@/lib/core/connectors";
import { requireConnectorAuth, errorResponse } from "../auth";

function parseItems(body: unknown): SyncItem[] | null {
  if (!Array.isArray(body)) return null;
  const items: SyncItem[] = [];
  for (const raw of body) {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.path !== "string" || !r.path) return null;
    if (typeof r.filename !== "string" || !r.filename) return null;
    if (typeof r.folderType !== "string" || !FOLDER_TYPES.includes(r.folderType as FolderType)) return null;
    if (typeof r.modifiedAt !== "string") return null;
    items.push({
      path: r.path,
      filename: r.filename,
      folderType: r.folderType as FolderType,
      modifiedAt: r.modifiedAt,
      thumbnail: typeof r.thumbnail === "string" ? r.thumbnail : undefined,
    });
  }
  return items;
}

export async function POST(req: NextRequest) {
  const auth = requireConnectorAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const items = parseItems(body?.items);
  if (!items) {
    return errorResponse("INVALID_INPUT", "items must be an array of {path, filename, folderType, modifiedAt, thumbnail?}.", 400);
  }

  const result = applySyncBatch(auth.device, items);
  return NextResponse.json(result);
}
