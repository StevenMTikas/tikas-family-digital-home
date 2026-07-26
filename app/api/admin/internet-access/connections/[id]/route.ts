// Revokes a Standing Integration Connection (currently: Email accounts —
// see Email.md) directly from the Internet Access screen.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { logSecurityEvent } from "@/lib/core/logging";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can revoke a connection.", 403);
  }

  const db = getDb();
  const connection = db.prepare(`SELECT email_address FROM email_accounts WHERE id = ?`).get(id) as
    | { email_address: string }
    | undefined;
  if (!connection) return errorResponse("NOT_FOUND", "No such connection.", 404);

  db.prepare(`UPDATE email_accounts SET status = 'revoked' WHERE id = ?`).run(id);

  await logSecurityEvent({
    type: "permission_changed",
    userId: actor.id,
    detail: { action: "connection_revoked", connectionId: id, emailAddress: connection.email_address },
  });

  return NextResponse.json({ id, revoked: true });
}
