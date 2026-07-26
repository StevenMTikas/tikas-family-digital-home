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
  return res.json();
}

export async function getFamilyBriefing(): Promise<FamilyBriefing> {
  return unwrap(await fetch("/api/dashboard/family"));
}
