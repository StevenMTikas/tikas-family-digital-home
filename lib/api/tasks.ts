// Thin typed API client for the Tasks module — one file per module, per
// Application_Architecture.md's "Frontend ↔ Backend Communication" section.
// Components call these functions rather than calling fetch() directly, so
// fetch/error-handling logic lives in one place per module.

export interface Task {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  dueDate: string | null;
  status: "not_done" | "done";
  assignedBy: string;
  visibility: "public" | "private";
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
  input: Partial<Omit<TaskInput, "ownerId">>
): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
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

export async function deleteTask(id: string): Promise<void> {
  return unwrap(await fetch(`/api/tasks/${id}`, { method: "DELETE" }));
}
