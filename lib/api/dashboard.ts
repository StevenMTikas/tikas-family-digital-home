// Thin typed API client for the family-wide Morning Briefing — see
// Application_Architecture.md's "Frontend ↔ Backend Communication" section.
// The individual ("My Day") view is fetched server-side in app/dashboard/page.tsx.

export interface FamilyEvent {
  id: string;
  title: string;
  dateTime: string;
  assigneeNames: string[];
  color: string | null;
}

export interface FamilyTask {
  id: string;
  title: string;
  ownerName: string;
  status: "not_done" | "done";
}

export interface FamilyBriefing {
  events: FamilyEvent[];
  tasks: FamilyTask[];
}

export class DashboardApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new DashboardApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getFamilyBriefing(): Promise<FamilyBriefing> {
  return unwrap(await fetch("/api/dashboard/family"));
}

export interface FamilyMessage {
  id: string;
  text: string;
  postedBy: string;
  postedByName: string;
  createdAt: string;
  updatedAt: string;
}

export async function getFamilyMessages(): Promise<FamilyMessage[]> {
  return unwrap(await fetch("/api/dashboard/messages"));
}

export async function postFamilyMessage(text: string): Promise<FamilyMessage> {
  return unwrap(
    await fetch("/api/dashboard/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  );
}

export async function editFamilyMessage(id: string, text: string): Promise<FamilyMessage> {
  return unwrap(
    await fetch(`/api/dashboard/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
  );
}

export async function deleteFamilyMessage(id: string): Promise<void> {
  return unwrap(await fetch(`/api/dashboard/messages/${id}`, { method: "DELETE" }));
}
