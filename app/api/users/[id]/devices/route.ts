// Read-only device list for a user's own account. See Users.md: "a user can
// see the device(s) linked to their own account, but cannot add, remove, or
// edit them" — that remains admin-only, through Administration, not this route.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface DeviceRow {
  id: string;
  device_type: string;
  device_name: string;
  status: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  // Viewing your own devices needs no special permission — but per Users.md
  // this is a "my devices" view, not one you can use to inspect anyone else's.
  if (actor.id !== id) {
    return errorResponse("FORBIDDEN", "You can only view your own devices here.", 403);
  }

  const rows = getDb()
    .prepare(`SELECT id, device_type, device_name, status FROM devices WHERE user_id = ?`)
    .all(id) as DeviceRow[];

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      type: row.device_type,
      name: row.device_name,
      status: row.status,
    }))
  );
}
