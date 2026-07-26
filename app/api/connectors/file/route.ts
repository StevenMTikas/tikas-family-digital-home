// A connector's response to a pending file request — uploads the actual
// bytes for one specific, previously-requested Document/Photo. This is the
// only point where a connector sends real file content, per
// File_Connector_Architecture.md: "metadata only" at sync time, files
// "pulled on demand."

import { NextRequest, NextResponse } from "next/server";
import { receiveFetchedFile } from "@/lib/core/connectors";
import { requireConnectorAuth, errorResponse } from "../auth";

export async function POST(req: NextRequest) {
  const auth = requireConnectorAuth(req);
  if ("error" in auth) return auth.error;

  const formData = await req.formData().catch(() => null);
  const contentType = formData?.get("contentType");
  const id = formData?.get("id");
  const file = formData?.get("file");

  if (contentType !== "document" && contentType !== "photo") {
    return errorResponse("INVALID_INPUT", "contentType must be 'document' or 'photo'.", 400);
  }
  if (typeof id !== "string" || !id) {
    return errorResponse("INVALID_INPUT", "id is required.", 400);
  }
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("INVALID_INPUT", "file is required.", 400);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await receiveFetchedFile(auth.device, contentType, id, file.name, buffer);
  } catch (err) {
    return errorResponse("NOT_FOUND", err instanceof Error ? err.message : "No such pending request.", 404);
  }

  return NextResponse.json({ id, contentType, fetched: true });
}
