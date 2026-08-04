// Subjects API — the manageable list backing a homework Task's subject. See
// db/schema.sql's subjects comment and docs/02_Modules/Homeschool.md.
// Listing is open to any logged-in user (the Add/Edit Task form's Subject
// picker needs it); rename/delete are Super Admin only
// (app/api/subjects/[id]/route.ts).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface SubjectRow {
  id: string;
  name: string;
  homework_count: number;
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const rows = getDb()
    .prepare(
      `SELECT s.id, s.name, COUNT(hd.task_id) AS homework_count
       FROM subjects s
       LEFT JOIN homework_details hd ON hd.subject_id = s.id
       GROUP BY s.id
       ORDER BY s.name COLLATE NOCASE`
    )
    .all() as SubjectRow[];

  return NextResponse.json(rows.map((r) => ({ id: r.id, name: r.name, homeworkCount: r.homework_count })));
}
