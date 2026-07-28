// Single-event API. See docs/02_Modules/Calendar.md: "Editing restricted to
// creator + admins" — being an assigned participant does not grant edit rights.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const EVENT_CATEGORIES = ["Budget", "Home Repair", "Chores", "Medical", "School", "Social/Family"] as const;
type EventCategory = (typeof EVENT_CATEGORIES)[number];

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  date_time: string;
  created_by: string;
  visibility: "public" | "private";
  category: EventCategory | null;
  reminder_lead_time: string | null;
}

function getAssigneeIds(eventId: string): string[] {
  return (
    getDb().prepare(`SELECT user_id FROM event_assignments WHERE event_id = ?`).all(eventId) as {
      user_id: string;
    }[]
  ).map((row) => row.user_id);
}

function toEventResponse(row: EventRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dateTime: row.date_time,
    visibility: row.visibility,
    category: row.category,
    reminderLeadTime: row.reminder_lead_time,
    createdBy: row.created_by,
    assigneeIds: getAssigneeIds(row.id),
  };
}

async function loadEventForEdit(id: string, actorId: string | null) {
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return { error: errorResponse("UNAUTHENTICATED", "Login required.", 401) } as const;

  const row = getDb().prepare(`SELECT * FROM events WHERE id = ?`).get(id) as EventRow | undefined;
  if (!row) return { error: errorResponse("NOT_FOUND", "No such event.", 404) } as const;

  if (!canManageUser(actor, row.created_by)) {
    return {
      error: errorResponse("FORBIDDEN", "Only the event's creator or an admin can change it.", 403),
    } as const;
  }

  return { row } as const;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadEventForEdit(id, req.headers.get("x-user-id"));
  if ("error" in result) return result.error;

  const body = await req.json().catch(() => null);
  const db = getDb();

  const updates: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (typeof body?.description === "string" || body?.description === null) {
    updates.description = body.description;
  }
  if (typeof body?.dateTime === "string" && body.dateTime) updates.date_time = body.dateTime;
  if (body?.visibility === "public" || body?.visibility === "private") {
    updates.visibility = body.visibility;
  }
  if (body?.category === null || EVENT_CATEGORIES.includes(body?.category)) {
    updates.category = body.category;
  }
  if (typeof body?.reminderLeadTime === "string" || body?.reminderLeadTime === null) {
    updates.reminder_lead_time = body.reminderLeadTime;
  }

  const fields = Object.keys(updates);
  const assigneeIds = Array.isArray(body?.assigneeIds)
    ? (body.assigneeIds.filter((v: unknown) => typeof v === "string") as string[])
    : undefined;

  if (fields.length === 0 && !assigneeIds) {
    return errorResponse("INVALID_INPUT", "No changes provided.", 400);
  }
  if (assigneeIds && assigneeIds.length === 0) {
    return errorResponse("INVALID_INPUT", "At least one assignee is required.", 400);
  }

  const update = db.transaction(() => {
    if (fields.length > 0) {
      const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
      db.prepare(`UPDATE events SET ${setClause} WHERE id = @id`).run({ ...updates, id });
    }
    if (assigneeIds) {
      db.prepare(`DELETE FROM event_assignments WHERE event_id = ?`).run(id);
      const insertAssignment = db.prepare(
        `INSERT INTO event_assignments (event_id, user_id) VALUES (?, ?)`
      );
      for (const userId of assigneeIds) insertAssignment.run(id, userId);
    }
  });
  update();

  const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id) as EventRow;
  return NextResponse.json(toEventResponse(row));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadEventForEdit(id, req.headers.get("x-user-id"));
  if ("error" in result) return result.error;

  getDb().prepare(`DELETE FROM events WHERE id = ?`).run(id);
  return new NextResponse(null, { status: 204 });
}
