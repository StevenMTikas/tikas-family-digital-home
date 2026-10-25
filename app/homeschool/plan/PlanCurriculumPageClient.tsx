"use client";

// "Plan Curriculum" — School Year (start/end date + blackout ranges),
// per-subject curriculum links, Generate Plan, and the Assignment_Draft
// review queue. See docs/02_Modules/Homeschool.md's "AI-Generated
// Curriculum Plan" section. Admin/Super-Admin only (enforced server-side in
// page.tsx and every API route this calls).

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getSchoolYear,
  saveSchoolYear,
  addBlackout,
  deleteBlackout,
  getCurriculumLinks,
  addCurriculumLink,
  deleteCurriculumLink,
  generatePlan,
  getDrafts,
  updateDraft,
  approveDraft,
  rejectDraft,
  CurriculumPlanApiError,
  type SchoolYear,
  type CurriculumLink,
  type AssignmentDraft,
} from "@/lib/api/curriculum-plan";

export interface ChildOption {
  id: string;
  fullName: string;
}

export interface SubjectOption {
  id: string;
  name: string;
}

export default function PlanCurriculumPageClient({
  childUsers,
  subjects,
}: {
  childUsers: ChildOption[];
  subjects: SubjectOption[];
}) {
  const [selectedChildId, setSelectedChildId] = useState<string | null>(childUsers[0]?.id ?? null);
  // SubjectsSection/DraftsSection are independent client components with
  // their own fetch state — a successful Generate Plan bumps this so
  // DraftsSection's effect re-fires and picks up the new batch, since
  // router.refresh() alone only re-runs the server component (page.tsx),
  // not a sibling client component's own useEffect.
  const [draftsRefreshKey, setDraftsRefreshKey] = useState(0);

  return (
    <main className="p-6 max-w-[720px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium">Plan Curriculum</h1>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            Add course links, set the school year, and let the AI draft a paced plan for you to review.
          </p>
        </div>
        <Link href="/homeschool" className="text-[13px] font-semibold text-accent-strong">
          ← Back to Homeschool
        </Link>
      </div>

      {childUsers.length === 0 ? (
        <p className="text-[13px] text-ink-muted mt-6">No children on this account yet.</p>
      ) : (
        <>
          {childUsers.length > 1 && (
            <div className="flex items-center gap-2 mt-6">
              {childUsers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedChildId(c.id)}
                  className={`text-xs px-3 py-1.5 rounded-full ${
                    selectedChildId === c.id ? "bg-accent-strong text-white" : "bg-base text-ink"
                  }`}
                >
                  {c.fullName}
                </button>
              ))}
            </div>
          )}

          {selectedChildId && (
            <>
              <SchoolYearSection childId={selectedChildId} />
              <SubjectsSection
                childId={selectedChildId}
                subjects={subjects}
                onGenerated={() => setDraftsRefreshKey((k) => k + 1)}
              />
              <DraftsSection childId={selectedChildId} subjects={subjects} refreshKey={draftsRefreshKey} />
            </>
          )}
        </>
      )}
    </main>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl p-6 shadow-[0_8px_20px_rgba(58,52,44,0.05)] mt-5">
      <div className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</div>
      {subtitle && <p className="text-[11.5px] text-ink-muted mt-1">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SchoolYearSection({ childId }: { childId: string }) {
  const [year, setYear] = useState<SchoolYear | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [blackoutLabel, setBlackoutLabel] = useState("");
  const [blackoutStart, setBlackoutStart] = useState("");
  const [blackoutEnd, setBlackoutEnd] = useState("");
  const [addingBlackout, setAddingBlackout] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const y = await getSchoolYear(childId);
      setYear(y);
      setStartDate(y?.startDate ?? "");
      setEndDate(y?.endDate ?? "");
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveYear() {
    if (!startDate || !endDate) {
      setError("Start and end date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveSchoolYear(childId, startDate, endDate);
      setYear(saved);
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddBlackout() {
    if (!year || !blackoutLabel.trim() || !blackoutStart || !blackoutEnd) {
      setError("A label, start date, and end date are all required for a blackout range.");
      return;
    }
    setAddingBlackout(true);
    setError(null);
    try {
      await addBlackout(year.id, blackoutLabel.trim(), blackoutStart, blackoutEnd);
      setBlackoutLabel("");
      setBlackoutStart("");
      setBlackoutEnd("");
      await load();
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    } finally {
      setAddingBlackout(false);
    }
  }

  async function handleDeleteBlackout(blackoutId: string) {
    if (!year) return;
    setError(null);
    try {
      await deleteBlackout(year.id, blackoutId);
      await load();
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <SectionCard title="School Year" subtitle="Shared by every subject's plan for this child — start date, fixed end date, and any breaks to skip.">
      {loading ? (
        <p className="text-xs text-ink-muted">Loading…</p>
      ) : (
        <>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <button
              type="button"
              onClick={handleSaveYear}
              disabled={saving}
              className="h-[38px] px-4 rounded-xl bg-accent-strong text-white text-[13px] font-semibold disabled:opacity-70"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          {year && (
            <div className="mt-5">
              <div className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase mb-2">Blackout Ranges</div>
              {year.blackouts.length === 0 ? (
                <p className="text-xs text-ink-muted">None yet.</p>
              ) : (
                <div className="flex flex-col gap-1.5 mb-3">
                  {year.blackouts.map((b) => (
                    <div key={b.id} className="flex items-center gap-2 text-[12.5px] text-ink">
                      <div className="flex-1">
                        {b.label} — {b.startDate} to {b.endDate}
                      </div>
                      <button type="button" onClick={() => handleDeleteBlackout(b.id)} className="text-[11px] text-urgent">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-end flex-wrap">
                <input
                  type="text"
                  placeholder="e.g. Winter Break"
                  value={blackoutLabel}
                  onChange={(e) => setBlackoutLabel(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-ink/15 text-[12.5px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <input
                  type="date"
                  value={blackoutStart}
                  onChange={(e) => setBlackoutStart(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-ink/15 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <input
                  type="date"
                  value={blackoutEnd}
                  onChange={(e) => setBlackoutEnd(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-ink/15 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <button
                  type="button"
                  onClick={handleAddBlackout}
                  disabled={addingBlackout}
                  className="h-[34px] px-3 rounded-xl bg-base text-ink text-[12px] font-semibold disabled:opacity-70"
                >
                  + Add Range
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p className="text-xs text-urgent mt-3">{error}</p>}
    </SectionCard>
  );
}

function SubjectsSection({
  childId,
  subjects,
  onGenerated,
}: {
  childId: string;
  subjects: SubjectOption[];
  onGenerated: () => void;
}) {
  return (
    <SectionCard title="Subjects &amp; Links" subtitle="Add each subject's course/material link, then generate a paced plan from it.">
      {subjects.length === 0 ? (
        <p className="text-xs text-ink-muted">No subjects yet — add one from the Add Assignment form on the Homeschool screen first.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {subjects.map((s) => (
            <SubjectLinksRow key={s.id} subject={s} childId={childId} onGenerated={onGenerated} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function SubjectLinksRow({
  subject,
  childId,
  onGenerated,
}: {
  subject: SubjectOption;
  childId: string;
  onGenerated: () => void;
}) {
  const router = useRouter();
  const [links, setLinks] = useState<CurriculumLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [minPerWeek, setMinPerWeek] = useState("2");
  const [maxPerWeek, setMaxPerWeek] = useState("4");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLinks(await getCurriculumLinks(subject.id));
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [subject.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddLink() {
    if (!newUrl.trim()) {
      setError("Enter a URL.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await addCurriculumLink(subject.id, newUrl.trim(), newLabel.trim() || null);
      setNewUrl("");
      setNewLabel("");
      await load();
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteLink(id: string) {
    setError(null);
    try {
      await deleteCurriculumLink(id);
      await load();
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    }
  }

  async function handleGenerate() {
    const min = parseInt(minPerWeek, 10);
    const max = parseInt(maxPerWeek, 10);
    if (!min || !max || max < min) {
      setError("Enter a valid min/max assignments per week (max must be at least min).");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await generatePlan(subject.id, childId, min, max);
      onGenerated();
      router.refresh();
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="border-t border-ink/[0.07] pt-4 first:border-t-0 first:pt-0">
      <div className="text-[13.5px] font-semibold text-ink">{subject.name}</div>
      {loading ? (
        <p className="text-xs text-ink-muted mt-1.5">Loading links…</p>
      ) : (
        <div className="flex flex-col gap-1.5 mt-1.5">
          {links.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-[12.5px]">
              <a href={l.url} target="_blank" rel="noreferrer" className="text-accent-strong truncate flex-1">
                {l.label || l.url}
              </a>
              <button type="button" onClick={() => handleDeleteLink(l.id)} className="text-[11px] text-urgent">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-end flex-wrap mt-2.5">
        <input
          type="text"
          placeholder="https://…"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-1.5 rounded-xl border border-ink/15 text-[12.5px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <input
          type="text"
          placeholder="Label (optional)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="w-[150px] px-3 py-1.5 rounded-xl border border-ink/15 text-[12.5px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="button"
          onClick={handleAddLink}
          disabled={adding}
          className="h-[34px] px-3 rounded-xl bg-base text-ink text-[12px] font-semibold disabled:opacity-70"
        >
          + Add Link
        </button>
      </div>

      {links.length > 0 && (
        <div className="flex items-end gap-2 mt-3 bg-base rounded-xl p-3">
          <div>
            <label className="block text-[10.5px] font-semibold text-ink-muted mb-1">Min/week</label>
            <input
              type="number"
              min={1}
              value={minPerWeek}
              onChange={(e) => setMinPerWeek(e.target.value)}
              className="w-16 px-2 py-1.5 rounded-lg border border-ink/15 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-[10.5px] font-semibold text-ink-muted mb-1">Max/week</label>
            <input
              type="number"
              min={1}
              value={maxPerWeek}
              onChange={(e) => setMaxPerWeek(e.target.value)}
              className="w-16 px-2 py-1.5 rounded-lg border border-ink/15 text-[12.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="h-[34px] px-4 rounded-xl bg-accent-strong text-white text-[12.5px] font-semibold disabled:opacity-70"
          >
            {generating ? "Generating…" : "Generate Plan"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-urgent mt-2">{error}</p>}
    </div>
  );
}

function DraftsSection({
  childId,
  subjects,
  refreshKey,
}: {
  childId: string;
  subjects: SubjectOption[];
  refreshKey: number;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<AssignmentDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editReference, setEditReference] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subjectsById = new Map(subjects.map((s) => [s.id, s.name]));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDrafts(await getDrafts(childId));
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    load();
    // refreshKey deliberately included — bumping it (after a successful
    // Generate Plan elsewhere on this page) is the whole point of this
    // effect re-running, not just childId changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey]);

  function startEdit(draft: AssignmentDraft) {
    setEditingId(draft.id);
    setEditTitle(draft.title);
    setEditDueDate(draft.suggestedDueDate);
    setEditReference(draft.curriculumReference ?? "");
    setError(null);
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await updateDraft(id, { title: editTitle.trim(), suggestedDueDate: editDueDate, curriculumReference: editReference.trim() || null });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await approveDraft(id);
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await rejectDraft(id);
      await load();
    } catch (err) {
      setError(err instanceof CurriculumPlanApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SectionCard title="Drafts Awaiting Review" subtitle="Nothing here is on the calendar yet — edit if needed, then approve or reject each one.">
      {error && <p className="text-xs text-urgent mb-3">{error}</p>}
      {loading ? (
        <p className="text-xs text-ink-muted">Loading…</p>
      ) : drafts.length === 0 ? (
        <p className="text-xs text-ink-muted">No pending drafts. Generate a plan for a subject above to see one here.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {drafts.map((d) => (
            <div key={d.id} className="bg-base rounded-xl p-3.5">
              {editingId === d.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                    <input
                      type="text"
                      placeholder="Curriculum reference"
                      value={editReference}
                      onChange={(e) => setEditReference(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-ink/15 text-[13px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setEditingId(null)} className="text-[12px] text-ink-muted">
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(d.id)}
                      disabled={busyId === d.id}
                      className="text-[12px] font-semibold text-accent-strong disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <div className="text-[13px] text-ink font-medium">{d.title}</div>
                    <div className="text-[10.5px] text-accent-strong bg-accent/[0.12] px-2 py-0.5 rounded-full">
                      {d.subjectName ?? subjectsById.get(d.subjectId) ?? "?"}
                    </div>
                  </div>
                  <div className="text-[11.5px] text-ink-muted mt-0.5">
                    Due {d.suggestedDueDate}
                    {d.curriculumReference ? ` · ${d.curriculumReference}` : ""}
                  </div>
                  <div className="flex justify-end gap-3 mt-2.5">
                    <button type="button" onClick={() => startEdit(d)} className="text-[11.5px] text-ink-muted underline">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReject(d.id)}
                      disabled={busyId === d.id}
                      className="text-[11.5px] font-semibold text-urgent disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApprove(d.id)}
                      disabled={busyId === d.id}
                      className="text-[11.5px] font-semibold text-white bg-accent-strong px-3 py-1 rounded-full disabled:opacity-60"
                    >
                      Approve
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
