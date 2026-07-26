// Family-data tools the Assistant can call (Ollama function-calling) when a
// question needs real family data rather than general knowledge — per
// AI_Architecture.md: "the AI needs to call into permissions and data
// lookups, not just converse." Each tool only returns what the requesting
// user already has permission to see, same rule as every other module
// (AI_Permissions.md: "no broader visibility than that user has themselves").

import { getDb } from "@/db/client";
import { getAuthUser, canManageUser } from "@/lib/core/permissions";
import type { ToolSpec } from "./ollama";

export const ASSISTANT_TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "get_upcoming_events",
      description: "Get the family's upcoming calendar events the requesting user can see, soonest first.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "How many days ahead to look. Defaults to 7." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_open_tasks",
      description: "Get open (not-done) tasks the requesting user can see, soonest due date first.",
      parameters: { type: "object", properties: {} },
    },
  },
];

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  date_time: string;
  created_by: string;
  visibility: "public" | "private";
}

interface TaskRow {
  id: string;
  title: string;
  owner_id: string;
  due_date: string | null;
  assigned_by: string;
  visibility: "public" | "private";
}

export async function getUpcomingEvents(userId: string, days = 7): Promise<string> {
  const actor = await getAuthUser(userId);
  if (!actor) return "Could not verify the requesting user.";

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  const toIso = (d: Date) => d.toISOString().slice(0, 19);

  const rows = getDb()
    .prepare(`SELECT * FROM events WHERE date_time >= ? AND date_time < ? ORDER BY date_time`)
    .all(toIso(now), toIso(end)) as EventRow[];

  const visible = rows.filter((row) => row.visibility === "public" || canManageUser(actor, row.created_by));
  if (visible.length === 0) return `No events in the next ${days} day(s).`;

  return visible.map((e) => `- ${e.title} at ${e.date_time}${e.description ? `: ${e.description}` : ""}`).join("\n");
}

export async function getOpenTasks(userId: string): Promise<string> {
  const actor = await getAuthUser(userId);
  if (!actor) return "Could not verify the requesting user.";

  const rows = getDb()
    .prepare(`SELECT * FROM tasks WHERE status = 'not_done' ORDER BY due_date IS NULL, due_date`)
    .all() as TaskRow[];

  const visible = rows.filter(
    (row) =>
      row.visibility === "public" ||
      userId === row.owner_id ||
      userId === row.assigned_by ||
      canManageUser(actor, row.owner_id)
  );
  if (visible.length === 0) return "No open tasks.";

  return visible.map((t) => `- ${t.title}${t.due_date ? ` (due ${t.due_date})` : " (no due date)"}`).join("\n");
}

export async function runTool(name: string, args: Record<string, unknown>, userId: string): Promise<string> {
  switch (name) {
    case "get_upcoming_events":
      return getUpcomingEvents(userId, typeof args.days === "number" ? args.days : 7);
    case "get_open_tasks":
      return getOpenTasks(userId);
    default:
      return `Unknown tool: ${name}`;
  }
}
