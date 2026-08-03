// What folder paths this device should be watching, per folder type — the
// host-managed alternative to a connector's local config.json, set from the
// Admin dashboard. See File_Connector_Architecture.md's "Host- and
// Dashboard-Managed Folders" section. A connector fetches this on every
// pending-requests poll; if the host has nothing configured for a given
// folder type, the connector falls back to its own local config.json for
// that type, so nothing breaks for a connector that predates this feature.

import { NextRequest, NextResponse } from "next/server";
import { getWatchedPaths, FOLDER_TYPES, type FolderType } from "@/lib/core/connectors";
import { requireConnectorAuth } from "../auth";

export async function GET(req: NextRequest) {
  const auth = requireConnectorAuth(req);
  if ("error" in auth) return auth.error;

  const watched = getWatchedPaths(auth.device.id);

  const folders = Object.fromEntries(FOLDER_TYPES.map((type) => [type, [] as string[]])) as Record<
    FolderType,
    string[]
  >;
  for (const w of watched) folders[w.folderType].push(w.path);

  return NextResponse.json({ folders });
}
