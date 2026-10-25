// School Year API — the shared start/end date + blackout ranges every
// subject's AI-generated curriculum plan for a child is paced against. See
// db/schema.sql's school_years comment and docs/02_Modules/Homeschool.md.
// Admin/Super-Admin only, same boundary as the rest of curriculum planning.

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
  start_date: string;
  end_date: string;
}

interface BlackoutRow {
  id: string;
  school_year_id: string;
  label: string;
  start_date: string;
  end_date: string;
}

function toResponse(year: SchoolYearRow, blackouts: BlackoutRow[]) {
  return {
    id: year.id,
    childId: year.child_id,
    startDate: year.start_date,
    endDate: year.end_date,
    blackouts: blackouts.map((b) => ({ id: b.id, label: b.label, startDate: b.start_date, endDate: b.end_date })),
  };
}

// GET /api/homeschool/school-year?childId=... — the child's current School
// Year (there's at most one per child), or null if none set yet.
export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const childId = req.nextUrl.searchParams.get("childId");
  if (!childId) return errorResponse("INVALID_INPUT", "childId is required.", 400);
  if (!hasAdminAuthorityOver(actor, childId)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin over this child can view their school year.", 403);
  }

  const db = getDb();
  const year = db.prepare(`SELECT * FROM school_years WHERE child_id = ?`).get(childId) as SchoolYearRow | undefined;
  if (!year) return NextResponse.json(null);

  const blackouts = db
    .prepare(`SELECT * FROM school_year_blackouts WHERE school_year_id = ? ORDER BY start_date`)
    .all(year.id) as BlackoutRow[];

  return NextResponse.json(toResponse(year, blackouts));
}

// POST /api/homeschool/school-year — creates or replaces the child's School
// Year's start/end date. One per child: an existing one (and its blackouts)
// is replaced rather than accumulating duplicates.
export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const body = await req.json().catch(() => null);
  const childId = typeof body?.childId === "string" ? body.childId : "";
  const startDate = typeof body?.startDate === "string" ? body.startDate : "";
  const endDate = typeof body?.endDate === "string" ? body.endDate : "";

  if (!childId || !startDate || !endDate) {
    return errorResponse("INVALID_INPUT", "childId, startDate, and endDate are required.", 400);
  }
  if (endDate <= startDate) {
    return errorResponse("INVALID_INPUT", "End date must be after start date.", 400);
  }
  if (!hasAdminAuthorityOver(actor, childId)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin over this child can set their school year.", 403);
  }

  const db = getDb();
  const existing = db.prepare(`SELECT id FROM school_years WHERE child_id = ?`).get(childId) as { id: string } | undefined;

  const id = existing?.id ?? randomUUID();
  const save = db.transaction(() => {
    if (existing) {
      db.prepare(`UPDATE school_years SET start_date = ?, end_date = ? WHERE id = ?`).run(startDate, endDate, id);
    } else {
      db.prepare(
        `INSERT INTO school_years (id, child_id, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?)`
      ).run(id, childId, startDate, endDate, actorId);
    }
  });
  save();

  const year = db.prepare(`SELECT * FROM school_years WHERE id = ?`).get(id) as SchoolYearRow;
  const blackouts = db
    .prepare(`SELECT * FROM school_year_blackouts WHERE school_year_id = ? ORDER BY start_date`)
    .all(id) as BlackoutRow[];
  return NextResponse.json(toResponse(year, blackouts), { status: existing ? 200 : 201 });
}
