// Thin typed API client for Calendar — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export const EVENT_CATEGORIES = ["Budget", "Home Repair", "Chores", "Medical", "School", "Social/Family"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "biweekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

// Which occurrences an edit/delete on a recurring item applies to — "this"
// (default, single occurrence), "future" (this + every later occurrence in
// the series), or "series" (every occurrence, past and future).
export type RecurrenceScope = "this" | "future" | "series";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  dateTime: string;
  visibility: "public" | "private";
  category: EventCategory | null;
  reminderLeadTime: string | null;
  recurrenceId: string | null;
  recurrenceFrequency: RecurrenceFrequency | null;
  createdBy: string;
  assigneeIds: string[];
  canEdit: boolean;
}

export class CalendarApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new CalendarApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface EventInput {
  title: string;
  description?: string | null;
  dateTime: string;
  visibility: "public" | "private";
  category?: EventCategory | null;
  reminderLeadTime?: string | null;
  assigneeIds: string[];
  // Only meaningful when creating a new event — recurrence can't be changed
  // after creation (delete the series and start a new one instead).
  recurrence?: RecurrenceFrequency | null;
}

export async function getWeekEvents(weekStartIso: string): Promise<CalendarEvent[]> {
  const res = await fetch(`/api/calendar?week=${weekStartIso}`);
  return unwrap(res);
}

export async function createEvent(input: EventInput): Promise<CalendarEvent> {
  const res = await fetch("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return unwrap(res);
}

export async function updateEvent(
  id: string,
  input: Partial<EventInput>,
  editScope: RecurrenceScope = "this"
): Promise<CalendarEvent> {
  const res = await fetch(`/api/calendar/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, editScope }),
  });
  return unwrap(res);
}

export async function deleteEvent(id: string, scope: RecurrenceScope = "this"): Promise<void> {
  const res = await fetch(`/api/calendar/${id}?scope=${scope}`, { method: "DELETE" });
  return unwrap(res);
}
