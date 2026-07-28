// Thin typed API client for Calendar — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export const EVENT_CATEGORIES = ["Budget", "Home Repair", "Chores", "Medical", "School", "Social/Family"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  dateTime: string;
  visibility: "public" | "private";
  category: EventCategory | null;
  reminderLeadTime: string | null;
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

export async function updateEvent(id: string, input: Partial<EventInput>): Promise<CalendarEvent> {
  const res = await fetch(`/api/calendar/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return unwrap(res);
}

export async function deleteEvent(id: string): Promise<void> {
  const res = await fetch(`/api/calendar/${id}`, { method: "DELETE" });
  return unwrap(res);
}
