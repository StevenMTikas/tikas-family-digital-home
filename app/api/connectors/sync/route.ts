// Connector daily metadata sync. See docs/01_System_Architecture/
// File_Connector_Architecture.md's Data Flow — the connector reports
// metadata only (no file bytes) for everything currently in its designated
// folders; the host diffs this against what it already has for that device.
//
// Deliberately separate from the main module API pattern (see middleware.ts)
// — a connector isn't a logged-in family member, so it authenticates with
// its own device id + token instead of a session cookie.

import { NextRequest, NextResponse } from "next/server";
import { applySyncBatch, recordFolderScanStatus, FOLDER_TYPES, type SyncItem, type FolderType } from "@/lib/core/connectors";
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

interface FolderStatus {
  folderType: FolderType;
  path: string;
  status: "ok" | "not_found";
}

// Optional — older connectors that predate host-managed folders won't send
// this. A malformed entry is just skipped rather than failing the whole
// sync, since this is feedback for the Admin dashboard, not sync-critical.
function parseFolderStatuses(body: unknown): FolderStatus[] {
  if (!Array.isArray(body)) return [];
  const statuses: FolderStatus[] = [];
  for (const raw of body) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.folderType !== "string" || !FOLDER_TYPES.includes(r.folderType as FolderType)) continue;
    if (typeof r.path !== "string" || !r.path) continue;
    if (r.status !== "ok" && r.status !== "not_found") continue;
    statuses.push({ folderType: r.folderType as FolderType, path: r.path, status: r.status });
  }
  return statuses;
}

export async function POST(req: NextRequest) {
  const auth = requireConnectorAuth(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const items = parseItems(body?.items);
  if (!items) {
    return errorResponse("INVALID_INPUT", "items must be an array of {path, filename, folderType, modifiedAt, thumbnail?}.", 400);
  }
  const folderStatuses = parseFolderStatuses(body?.folderStatuses);

  const result = applySyncBatch(auth.device, items);
  for (const s of folderStatuses) recordFolderScanStatus(auth.device.id, s.folderType, s.path, s.status);

  // Event-driven Advisor trigger (Advisor.md: "generates a suggestion when
  // something happens that warrants one"), same pattern as
  // app/api/calendar/route.ts's POST — a sync that didn't actually add or
  // change anything has nothing new to suggest, so this only fires when
  // something did. Fire-and-forget: the LLM phrasing call shouldn't block
  // the connector's response, and a failure here shouldn't fail a sync that
  // already succeeded.
  if (result.created > 0 || result.updated > 0) {
    import("@/lib/core/ai/advisor")
      .then(({ runAdvisorDetectors }) => runAdvisorDetectors("event"))
      .catch((err) => console.error("[advisor] sync-driven check failed:", err));
  }

  return NextResponse.json(result);
}
