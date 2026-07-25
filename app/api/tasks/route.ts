// Tasks API. See docs/01_System_Architecture/API_Reference.md for the
// route/error conventions this implements, docs/02_Modules/Tasks.md for
// business rules (parent-to-child assignment only, visibility, edit rights),
// and docs/01_System_Architecture/Data_Model.md for the Task entity.

import { NextRequest, NextResponse } from "next/server";
import { canAccessFolder } from "@/lib/core/permissions";
import { logSecurityEvent } from "@/lib/core/logging";

// Standard error shape per Application_Architecture.md — every route returns
// errors in this shape so the frontend API client can handle them generically.
function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest) {
  // TODO: auth check (reject unauthenticated / untrusted-device sessions,
  // see Authentication.md), then list tasks visible to the requesting user
  // per Tasks.md's visibility rules.
  return errorResponse("NOT_IMPLEMENTED", "GET /api/tasks not yet implemented", 501);
}

export async function POST(req: NextRequest) {
  // TODO: create a task. Per Tasks.md — a Basic User can only create tasks
  // for themselves; only Admin/Super Admin can set assigned_by to someone
  // else. Enforce via /lib/core/permissions, not ad hoc checks here.
  return errorResponse("NOT_IMPLEMENTED", "POST /api/tasks not yet implemented", 501);
}
