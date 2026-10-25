// Family-data tools the Assistant can call (Ollama function-calling) when a
// question needs real family data rather than general knowledge — per
// AI_Architecture.md: "the AI needs to call into permissions and data
// lookups, not just converse." Each tool only returns what the requesting
// user already has permission to see, same rule as every other module
// (AI_Permissions.md: "no broader visibility than that user has themselves").
//
// Do NOT add a tool that reads lib/core/location or the location_reports
// table. Location_Tracking.md hard-excludes location data from the frontier
// escalation path entirely — a stronger guarantee than the sensitive-data
// approval gate every other tool's data goes through — and that guarantee
// only holds by this file never exposing it. If a real need for an
// AI-facing location feature comes up, that's a deliberate policy change to
// make in Location_Tracking.md first, not a tool to add here by default.

import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, hasAdminAuthorityOver, hasPermission } from "@/lib/core/permissions";
import { getTopMemories, formatMemoriesForPrompt } from "./memory";
import type { ToolSpec } from "./ollama";

// Cheap keyword check — no LLM call — for whether a message plausibly needs
// these tools at all. Offering ASSISTANT_TOOLS unconditionally on every
// message (even "give me the text of Amos 3:3") was the main trigger for
// the model attempting a tool call that has nothing to do with the
// question; not offering tools when nothing schedule/task-related is being
// asked removes that trigger for the common case of an unrelated question.
// Deliberately keyword-broad rather than precise — a false negative (tools
// withheld from a real schedule question) just means a general-knowledge
// answer instead of a data-backed one; a false positive (tools offered
// unnecessarily) is today's status quo, not a regression.
const TOOL_RELEVANT_KEYWORDS = [
  "task",
  "tasks",
  "todo",
  "to-do",
  "to do",
  "event",
  "events",
  "calendar",
  "schedule",
  "scheduled",
  "due",
  "upcoming",
  "appointment",
  "appointments",
  "meeting",
  "meetings",
  "remind",
  "reminder",
  "reminders",
  "today",
  "tomorrow",
  "this week",
  "next week",
  // "bills" has no dedicated data model — it's really Tasks/Events the
  // household already tracks (e.g. "Pay electricity bill") — but it's real,
  // recurring household vocabulary (a live user question, 2026-08-23) that
  // deserves the same tool access as "task"/"due", not a generic non-answer.
  "bill",
  "bills",
  // get_user_profile — a cross-user AI_Memory lookup, real family data, so
  // it needs the same "stay local, don't auto-route to frontier" treatment
  // as the rest of these (2026-08-01, added alongside that tool).
  "know about",
  "profile",
  "remember about",
];

export function messageNeedsTools(content: string): boolean {
  const lower = content.toLowerCase();
  return TOOL_RELEVANT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

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
  {
    type: "function",
    function: {
      name: "get_user_profile",
      description:
        "Get what's known about a specific family member by name (their AI Memory facts — preferences, routines, relationships). Use this for questions like 'what do you know about X' or 'tell me about X'. Only returns results the requesting user is permitted to see about that person — always relay a permission-denied result honestly rather than guessing.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "The family member's name, e.g. 'Dad' or 'Malachi'." },
        },
        required: ["name"],
      },
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

interface UserProfileRow {
  id: string;
  full_name: string;
  relationship: string | null;
}

/**
 * Cross-user AI_Memory lookup by name — what "what do you know about X"
 * actually needs, and what was entirely missing before (2026-08-01): there
 * was no tool for looking up anyone but the requester's own facts, and
 * nothing ever wrote to AI_Memory in the first place (see
 * lib/core/ai/memory-extraction.ts). Visibility mirrors the household's
 * general rule: a user can always see their own; an Admin can see a user in
 * their admin_scope only if also individually granted "View Child Activity
 * Logs" (Authorization.md — reusing that existing, previously-unwired
 * permission rather than making admin-scope alone sufficient); a Super
 * Admin can see anyone unconditionally (hasAdminAuthorityOver/hasPermission
 * both already short-circuit true for super_admin).
 */
export async function getUserProfile(requesterId: string, name: string): Promise<string> {
  const actor = await getAuthUser(requesterId);
  if (!actor) return "Could not verify the requesting user.";

  const trimmed = name.trim();
  if (!trimmed) return "No name was given to look up.";

  const candidates = getDb()
    .prepare(`SELECT id, full_name, relationship FROM users WHERE full_name LIKE ? COLLATE NOCASE`)
    .all(`%${trimmed}%`) as UserProfileRow[];

  if (candidates.length === 0) return `No family member matching "${name}" was found.`;
  if (candidates.length > 1) {
    return `More than one family member matches "${name}": ${candidates.map((c) => c.full_name).join(", ")}. Ask which one specifically, then try again.`;
  }

  const target = candidates[0]!;
  const allowed = target.id === actor.id || (hasAdminAuthorityOver(actor, target.id) && hasPermission(actor, "viewChildActivityLogs"));
  if (!allowed) {
    return `You don't have permission to view ${target.full_name}'s information.`;
  }

  const memories = await getTopMemories(target.id);
  return [
    `Name: ${target.full_name}`,
    target.relationship ? `Relationship: ${target.relationship}` : null,
    "",
    "What's known about them:",
    formatMemoriesForPrompt(memories),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export async function runTool(name: string, args: Record<string, unknown>, userId: string): Promise<string> {
  switch (name) {
    case "get_upcoming_events":
      return getUpcomingEvents(userId, typeof args.days === "number" ? args.days : 7);
    case "get_open_tasks":
      return getOpenTasks(userId);
    case "get_user_profile":
      return getUserProfile(userId, typeof args.name === "string" ? args.name : "");
    default:
      return `Unknown tool: ${name}`;
  }
}
