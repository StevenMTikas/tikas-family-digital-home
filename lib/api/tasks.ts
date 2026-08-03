// Thin typed API client for the Tasks module — one file per module, per
// Application_Architecture.md's "Frontend ↔ Backend Communication" section.
// Components call these functions rather than calling fetch() directly, so
// fetch/error-handling logic lives in one place per module.

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "biweekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

// Which occurrences an edit/delete on a recurring task applies to — "this"
// (default, single occurrence), "future" (this + every later occurrence in
// the series), or "series" (every occurrence, past and future). Status
// changes (done/not done) always apply to just the one occurrence touched,
// regardless of scope.
export type RecurrenceScope = "this" | "future" | "series";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  dueDate: string | null;
  status: "not_done" | "done";
  assignedBy: string;
  visibility: "public" | "private";
  recurrenceId: string | null;
  recurrenceFrequency: RecurrenceFrequency | null;
  canEdit: boolean;
  canComplete: boolean;
}

export class TasksApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new TasksApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getTasks(): Promise<Task[]> {
  return unwrap(await fetch("/api/tasks"));
}

export interface TaskInput {
  title: string;
  description?: string | null;
  dueDate: string;
  visibility: "public" | "private";
  ownerId?: string;
  // Only meaningful when creating a new task — recurrence can't be changed
  // after creation (delete the series and start a new one instead).
  recurrence?: RecurrenceFrequency | null;
}

export async function createTask(input: TaskInput): Promise<Task> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return unwrap(res);
}

export async function updateTask(
  id: string,
  input: Partial<Omit<TaskInput, "ownerId">>,
  editScope: RecurrenceScope = "this"
): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, editScope }),
  });
  return unwrap(res);
}

export async function setTaskStatus(id: string, status: "not_done" | "done"): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return unwrap(res);
}

export async function deleteTask(id: string, scope: RecurrenceScope = "this"): Promise<void> {
  return unwrap(await fetch(`/api/tasks/${id}?scope=${scope}`, { method: "DELETE" }));
}
