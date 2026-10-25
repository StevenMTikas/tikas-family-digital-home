// Thin typed API client for the AI-Generated Curriculum Plan feature — see
// Application_Architecture.md's "Frontend ↔ Backend Communication" section
// and docs/02_Modules/Homeschool.md.

export class CurriculumPlanApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new CurriculumPlanApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface SchoolYearBlackout {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

export interface SchoolYear {
  id: string;
  childId: string;
  startDate: string;
  endDate: string;
  blackouts: SchoolYearBlackout[];
}

export async function getSchoolYear(childId: string): Promise<SchoolYear | null> {
  return unwrap(await fetch(`/api/homeschool/school-year?childId=${childId}`));
}

export async function saveSchoolYear(childId: string, startDate: string, endDate: string): Promise<SchoolYear> {
  return unwrap(
    await fetch("/api/homeschool/school-year", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId, startDate, endDate }),
    })
  );
}

export async function addBlackout(schoolYearId: string, label: string, startDate: string, endDate: string): Promise<SchoolYearBlackout> {
  return unwrap(
    await fetch(`/api/homeschool/school-year/${schoolYearId}/blackouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, startDate, endDate }),
    })
  );
}

export async function deleteBlackout(schoolYearId: string, blackoutId: string): Promise<void> {
  return unwrap(await fetch(`/api/homeschool/school-year/${schoolYearId}/blackouts/${blackoutId}`, { method: "DELETE" }));
}

export interface CurriculumLink {
  id: string;
  subjectId: string;
  url: string;
  label: string | null;
}

export async function getCurriculumLinks(subjectId: string): Promise<CurriculumLink[]> {
  return unwrap(await fetch(`/api/homeschool/curriculum-links?subjectId=${subjectId}`));
}

export async function addCurriculumLink(subjectId: string, url: string, label: string | null): Promise<CurriculumLink> {
  return unwrap(
    await fetch("/api/homeschool/curriculum-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId, url, label }),
    })
  );
}

export async function deleteCurriculumLink(id: string): Promise<void> {
  return unwrap(await fetch(`/api/homeschool/curriculum-links/${id}`, { method: "DELETE" }));
}

export interface AssignmentDraft {
  id: string;
  subjectId: string;
  subjectName?: string;
  childId: string;
  batchId: string;
  title: string;
  curriculumReference: string | null;
  suggestedDueDate: string;
  status: "pending" | "approved";
  approvedTaskId?: string | null;
}

export async function generatePlan(
  subjectId: string,
  childId: string,
  minPerWeek: number,
  maxPerWeek: number
): Promise<{ batchId: string; drafts: AssignmentDraft[] }> {
  return unwrap(
    await fetch("/api/homeschool/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId, childId, minPerWeek, maxPerWeek }),
    })
  );
}

export async function getDrafts(childId: string): Promise<AssignmentDraft[]> {
  return unwrap(await fetch(`/api/homeschool/drafts?childId=${childId}`));
}

export async function updateDraft(
  id: string,
  input: { title?: string; suggestedDueDate?: string; curriculumReference?: string | null }
): Promise<AssignmentDraft> {
  return unwrap(
    await fetch(`/api/homeschool/drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function approveDraft(id: string): Promise<{ draftId: string; taskId: string; status: string }> {
  return unwrap(await fetch(`/api/homeschool/drafts/${id}/approve`, { method: "POST" }));
}

export async function rejectDraft(id: string): Promise<void> {
  return unwrap(await fetch(`/api/homeschool/drafts/${id}`, { method: "DELETE" }));
}
