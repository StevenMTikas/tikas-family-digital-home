// Generate Plan — the AI-Generated Curriculum Plan feature's core action.
// Fetches a subject's curriculum link(s), sends the material plus the
// child's School Year (start/end date, blackout ranges) and the requested
// weekly pace to the frontier model, and stores the result as pending
// Assignment_Drafts — never real Tasks. See db/schema.sql's
// assignment_drafts comment and docs/02_Modules/Homeschool.md.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser, hasAdminAuthorityOver, hasPermission } from "@/lib/core/permissions";
import { fetchCurriculumMaterial } from "@/lib/core/homework/fetch-material";
import { generateCurriculumPlan, type BlackoutRange } from "@/lib/core/ai/frontier";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface LinkRow {
  id: string;
  url: string;
  label: string | null;
}

interface SchoolYearRow {
  id: string;
  start_date: string;
  end_date: string;
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const body = await req.json().catch(() => null);
  const subjectId = typeof body?.subjectId === "string" ? body.subjectId : "";
  const childId = typeof body?.childId === "string" ? body.childId : "";
  const minPerWeek = Number.isInteger(body?.minPerWeek) ? (body.minPerWeek as number) : NaN;
  const maxPerWeek = Number.isInteger(body?.maxPerWeek) ? (body.maxPerWeek as number) : NaN;

  if (!subjectId || !childId || !(minPerWeek > 0) || !(maxPerWeek >= minPerWeek)) {
    return errorResponse(
      "INVALID_INPUT",
      "subjectId, childId, and a valid minPerWeek/maxPerWeek (min > 0, max >= min) are required.",
      400
    );
  }
  if (!hasAdminAuthorityOver(actor, childId)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin over this child can generate a plan for them.", 403);
  }
  if (!hasPermission(actor, "approveOutsideCalls")) {
    return errorResponse("FORBIDDEN", "Generating a plan sends curriculum material to an outside model — you need Approve Outside Calls to do this.", 403);
  }

  const db = getDb();

  const subject = db.prepare(`SELECT id, name FROM subjects WHERE id = ?`).get(subjectId) as
    | { id: string; name: string }
    | undefined;
  if (!subject) return errorResponse("NOT_FOUND", "No such subject.", 404);

  const links = db
    .prepare(`SELECT id, url, label FROM curriculum_links WHERE subject_id = ? ORDER BY added_at`)
    .all(subjectId) as LinkRow[];
  if (links.length === 0) {
    return errorResponse("INVALID_INPUT", "This subject has no curriculum link yet — add one first.", 400);
  }

  const schoolYear = db.prepare(`SELECT id, start_date, end_date FROM school_years WHERE child_id = ?`).get(childId) as
    | SchoolYearRow
    | undefined;
  if (!schoolYear) {
    return errorResponse("INVALID_INPUT", "Set this child's school year (start/end date) before generating a plan.", 400);
  }

  const blackoutRows = db
    .prepare(`SELECT label, start_date, end_date FROM school_year_blackouts WHERE school_year_id = ?`)
    .all(schoolYear.id) as { label: string; start_date: string; end_date: string }[];
  const blackouts: BlackoutRange[] = blackoutRows.map((b) => ({ startDate: b.start_date, endDate: b.end_date }));

  let materialText: string;
  try {
    const materials = await Promise.all(
      links.map(async (link) => {
        const text = await fetchCurriculumMaterial(link.url);
        return `--- ${link.label ?? link.url} ---\n${text}`;
      })
    );
    materialText = materials.join("\n\n");
  } catch (err) {
    return errorResponse(
      "FETCH_FAILED",
      err instanceof Error ? err.message : "Couldn't fetch one of this subject's curriculum links.",
      502
    );
  }

  let generated;
  try {
    generated = await generateCurriculumPlan({
      subjectName: subject.name,
      materialText,
      startDate: schoolYear.start_date,
      endDate: schoolYear.end_date,
      blackouts,
      minPerWeek,
      maxPerWeek,
    });
  } catch (err) {
    return errorResponse("GENERATION_FAILED", err instanceof Error ? err.message : "Plan generation failed.", 502);
  }

  if (generated.length === 0) {
    return errorResponse("GENERATION_FAILED", "The outside model didn't return any usable assignments for this material.", 502);
  }

  const batchId = randomUUID();
  const insert = db.transaction(() => {
    // A fresh generation replaces this subject's still-unreviewed batch —
    // never two pending batches stacked for the same subject+child.
    // Already-approved drafts (real Tasks by then) are untouched.
    db.prepare(`DELETE FROM assignment_drafts WHERE subject_id = ? AND child_id = ? AND status = 'pending'`).run(
      subjectId,
      childId
    );

    const insertStmt = db.prepare(
      `INSERT INTO assignment_drafts (id, subject_id, child_id, generation_batch_id, title, curriculum_reference, suggested_due_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    );
    for (const item of generated) {
      insertStmt.run(randomUUID(), subjectId, childId, batchId, item.title, item.curriculumReference || null, item.dueDate);
    }
  });
  insert();

  const drafts = db
    .prepare(`SELECT * FROM assignment_drafts WHERE generation_batch_id = ? ORDER BY suggested_due_date`)
    .all(batchId) as {
    id: string;
    subject_id: string;
    child_id: string;
    generation_batch_id: string;
    title: string;
    curriculum_reference: string | null;
    suggested_due_date: string;
    status: string;
  }[];

  return NextResponse.json(
    {
      batchId,
      drafts: drafts.map((d) => ({
        id: d.id,
        subjectId: d.subject_id,
        childId: d.child_id,
        batchId: d.generation_batch_id,
        title: d.title,
        curriculumReference: d.curriculum_reference,
        suggestedDueDate: d.suggested_due_date,
        status: d.status,
      })),
    },
    { status: 201 }
  );
}
