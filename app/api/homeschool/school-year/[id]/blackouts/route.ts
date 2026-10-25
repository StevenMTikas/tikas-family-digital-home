// Blackout ranges for one School Year (e.g. winter break) — added/removed
// independently of the year's own start/end date. See
// docs/02_Modules/Homeschool.md.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser, hasAdminAuthorityOver } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface SchoolYearRow {
  id: string;
  child_id: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const year = db.prepare(`SELECT id, child_id FROM school_years WHERE id = ?`).get(id) as SchoolYearRow | undefined;
  if (!year) return errorResponse("NOT_FOUND", "No such school year.", 404);
  if (!hasAdminAuthorityOver(actor, year.child_id)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin over this child can edit their school year.", 403);
  }

  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const startDate = typeof body?.startDate === "string" ? body.startDate : "";
  const endDate = typeof body?.endDate === "string" ? body.endDate : "";
  if (!label || !startDate || !endDate) {
    return errorResponse("INVALID_INPUT", "label, startDate, and endDate are required.", 400);
  }
  if (endDate < startDate) {
    return errorResponse("INVALID_INPUT", "End date can't be before start date.", 400);
  }

  const blackoutId = randomUUID();
  db.prepare(
    `INSERT INTO school_year_blackouts (id, school_year_id, label, start_date, end_date) VALUES (?, ?, ?, ?, ?)`
  ).run(blackoutId, id, label, startDate, endDate);

  return NextResponse.json({ id: blackoutId, label, startDate, endDate }, { status: 201 });
}
