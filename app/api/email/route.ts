// Email API. See docs/02_Modules/Email.md: connect/view own account is
// available to any user including a minor (Standing Integration Connection
// model — no outside-call approval flow), one account per user for MVP.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { getAccountForUser, connectEmailAccount, revokeEmailAccount, verifyImapCredentials } from "@/lib/core/email";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  return NextResponse.json({ account: getAccountForUser(actor.id) });
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const body = await req.json().catch(() => null);
  const provider = typeof body?.provider === "string" ? body.provider.trim() : "";
  const emailAddress = typeof body?.emailAddress === "string" ? body.emailAddress.trim() : "";
  const imapHost = typeof body?.imapHost === "string" ? body.imapHost.trim() : "";
  const imapPort = typeof body?.imapPort === "number" ? body.imapPort : Number(body?.imapPort);
  const imapUsername = typeof body?.imapUsername === "string" ? body.imapUsername.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!provider || !emailAddress || !imapHost || !Number.isFinite(imapPort) || !imapUsername || !password) {
    return errorResponse(
      "INVALID_INPUT",
      "provider, emailAddress, imapHost, imapPort, imapUsername, and password are all required.",
      400
    );
  }

  const credentialsOk = await verifyImapCredentials({ imapHost, imapPort, imapUsername, password });
  if (!credentialsOk) {
    return errorResponse("INVALID_CREDENTIALS", "Couldn't connect with those details — check the host, port, username, and password.", 400);
  }

  const account = connectEmailAccount({ userId: actor.id, provider, emailAddress, imapHost, imapPort, imapUsername, password });
  return NextResponse.json({ account }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  await revokeEmailAccount(actor.id);
  return NextResponse.json({ revoked: true });
}
