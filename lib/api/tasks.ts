// Thin typed API client for the Tasks module — one file per module, per
// Application_Architecture.md's "Frontend ↔ Backend Communication" section.
// Components call these functions rather than calling fetch() directly, so
// fetch/error-handling logic lives in one place per module.

export interface Task {
  id: string;
  title: string;
  ownerId: string;
  dueDate?: string;
  status: "not_done" | "done";
  visibility: "public" | "private";
}

export async function getTasks(): Promise<Task[]> {
  const res = await fetch("/api/tasks");
  if (!res.ok) throw new Error("Failed to load tasks");
  return res.json();
}

// TODO: createTask, completeTask, etc. — see docs/02_Modules/Tasks.md for
// the full set of actions (create, complete, edit) and who can perform each.
