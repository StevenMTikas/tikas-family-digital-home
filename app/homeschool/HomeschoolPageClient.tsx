"use client";

// Client half of the Homeschool screen — a month calendar of assignments by
// due date, an "Add Assignment" modal (Task + Homework_Detail fields in one
// form, assignee restricted to children, visibility always public per
// Steven's 2026-08-23 direction), and the same Overdue/Today/This Week/
// Completed list Tasks uses. Reuses Tasks' API/plumbing entirely
// (lib/api/tasks.ts, lib/tasks/grouping.ts) — only the UI is dedicated.
// See docs/02_Modules/Homeschool.md.

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import {
  createTask,
  updateTask,
  setTaskStatus,
  deleteTask,
  TasksApiError,
  RECURRENCE_FREQUENCIES,
  type Task,
  type TaskInput,
  type RecurrenceFrequency,
  type RecurrenceScope,
} from "@/lib/api/tasks";
import { getSubjects, type Subject } from "@/lib/api/subjects";
import { groupTasks } from "@/lib/tasks/grouping";
import { getMonthGridDays, formatMonthLabel, toISODate, parseISODate } from "@/lib/calendar/dates";

const RECURRENCE_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  yearly: "Yearly",
};

// Every field below is always present for a row that came back from
// app/homeschool/page.tsx or the /api/tasks endpoints when queried through
// this screen — subjectId etc. are typed optional on the shared Task
// interface only because app/tasks (plain tasks) doesn't populate them.
export interface AssignmentData extends Task {
  subjectId: string;
  subjectName: string;
}

export interface FamilyMemberOption {
  id: string;
  fullName: string;
  calendarColor: string | null;
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${MONTH_ABBR[m - 1]} ${d}`;
}

function dueLabel(task: AssignmentData, group: "overdue" | "today" | "week" | "completed"): string {
  if (!task.dueDate) return "";
  if (group === "overdue") return `Overdue — ${formatShortDate(task.dueDate)}`;
  if (group === "today") return "Today";
  return formatShortDate(task.dueDate);
}

// A small, stable palette keyed by subject id so the calendar/list badges
// stay visually distinct without needing a color field on Subject itself.
const SUBJECT_COLORS = ["#9C6A2E", "#4A7C6E", "#7C5C9C", "#B0553A", "#3D6B96", "#8A7B3E"];
function subjectColor(subjectId: string): string {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i++) hash = (hash * 31 + subjectId.charCodeAt(i)) >>> 0;
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length]!;
}

export default function HomeschoolPageClient({
  assignments,
  familyMembers,
  childUsers,
  currentUserId,
  canAssignToOthers,
  canGradeOwnerIds,
  todayIso,
  anchorDateIso,
}: {
  assignments: AssignmentData[];
  familyMembers: FamilyMemberOption[];
  childUsers: FamilyMemberOption[];
  currentUserId: string;
  canAssignToOthers: boolean;
  canGradeOwnerIds: string[];
  todayIso: string;
  anchorDateIso: string;
}) {
  const router = useRouter();
  const membersById = new Map(familyMembers.map((m) => [m.id, m]));
  const anchorDate = parseISODate(anchorDateIso, new Date());
  const monthDays = useMemo(() => getMonthGridDays(anchorDate), [anchorDateIso]);

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [filterChildId, setFilterChildId] = useState<string | null>(null);
  const [filterSubjectId, setFilterSubjectId] = useState<string | null>(null);

  const subjectFilterOptions = Array.from(
    new Map(assignments.map((a) => [a.subjectId, a.subjectName])).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const visibleAssignments = assignments
    .filter((a) => !filterChildId || a.ownerId === filterChildId)
    .filter((a) => !filterSubjectId || a.subjectId === filterSubjectId);
  const groups = groupTasks(visibleAssignments, todayIso);
  const monthAssignmentsByDay = monthDays.map((day) => visibleAssignments.filter((a) => a.dueDate === day.isoDate));
  const selectedAssignment = assignments.find((a) => a.id === selectedAssignmentId) ?? null;

  function goToMonth(dateIso: string) {
    router.push(`/homeschool?date=${dateIso}`);
  }

  function shiftMonth(months: number) {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + months, 1);
    goToMonth(toISODate(d));
  }

  async function toggleStatus(assignment: AssignmentData, e: React.MouseEvent) {
    e.stopPropagation();
    if (!assignment.canComplete) return;
    setToggleError(null);
    try {
      await setTaskStatus(assignment.id, assignment.status === "done" ? "not_done" : "done");
      router.refresh();
    } catch (err) {
      setToggleError(err instanceof TasksApiError ? err.message : "Something went wrong.");
    }
  }

  function renderSection(
    label: string,
    labelColorClass: string,
    group: "overdue" | "today" | "week" | "completed",
    list: AssignmentData[]
  ) {
    if (list.length === 0) return null;
    return (
      <div className="mb-6">
        <div className={`text-xs font-semibold tracking-wide uppercase mb-2.5 ${labelColorClass}`}>{label}</div>
        <div className="bg-surface rounded-2xl px-4 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
          {list.map((assignment, i) => {
            const owner = membersById.get(assignment.ownerId);
            const done = assignment.status === "done";
            return (
              <div
                key={assignment.id}
                onClick={() => setSelectedAssignmentId(assignment.id)}
                className={`flex items-center gap-3.5 py-3 cursor-pointer ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}
              >
                <button
                  type="button"
                  onClick={(e) => toggleStatus(assignment, e)}
                  disabled={!assignment.canComplete}
                  className={`w-[19px] h-[19px] rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    done ? "border-calm" : "border-ink/20"
                  } ${assignment.canComplete ? "cursor-pointer" : "cursor-default"}`}
                  aria-label={done ? "Mark not done" : "Mark done"}
                >
                  {done && <span className="text-calm text-[10px]">✓</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className={`text-[14.5px] ${done ? "text-ink-muted line-through" : "text-ink"}`}>
                      {assignment.title}
                    </div>
                    <div
                      className="text-[10.5px] px-2 py-0.5 rounded-full"
                      style={{ color: subjectColor(assignment.subjectId), backgroundColor: `${subjectColor(assignment.subjectId)}22` }}
                    >
                      {assignment.subjectName}
                    </div>
                  </div>
                  <div
                    className={`text-[11.5px] mt-0.5 ${
                      group === "overdue" && !done ? "text-urgent" : "text-ink-muted"
                    }`}
                  >
                    {dueLabel(assignment, group)}
                    {assignment.assignedBy !== assignment.ownerId &&
                      ` · assigned by ${membersById.get(assignment.assignedBy)?.fullName ?? "?"}`}
                  </div>
                </div>
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: owner?.calendarColor ?? "#9C6A2E" }}
                />
                <div className="text-[11.5px] text-ink-muted w-16">{owner?.fullName ?? "?"}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <main className="p-6 max-w-[900px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium">Homeschool</h1>
          <p className="text-[12.5px] text-ink-muted mt-0.5">{formatMonthLabel(anchorDate)}</p>
        </div>
        <div className="flex items-center gap-2.5">
          {canAssignToOthers && (
            <Link
              href="/homeschool/plan"
              className="h-[34px] px-4 rounded-xl bg-base text-ink text-[13px] font-semibold flex items-center"
            >
              Plan Curriculum
            </Link>
          )}
          <button
            type="button"
            onClick={() => setFormMode("create")}
            className="h-[34px] px-5 rounded-xl bg-accent-strong text-white text-[13px] font-semibold"
          >
            + Add Assignment
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-6 mb-3">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="w-[34px] h-[34px] rounded-xl bg-surface shadow-[0_4px_12px_rgba(58,52,44,0.05)] flex items-center justify-center"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => goToMonth(toISODate(new Date()))}
          className="h-[34px] px-3.5 rounded-xl bg-surface shadow-[0_4px_12px_rgba(58,52,44,0.05)] text-xs font-semibold text-ink-muted"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="w-[34px] h-[34px] rounded-xl bg-surface shadow-[0_4px_12px_rgba(58,52,44,0.05)] flex items-center justify-center"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <div key={label} className="text-[10.5px] font-semibold tracking-wide text-ink-muted uppercase text-center pb-1">
            {label}
          </div>
        ))}
        {monthDays.map((day, i) => {
          const dayAssignments = monthAssignmentsByDay[i]!;
          const MAX_VISIBLE = 3;
          return (
            <div
              key={day.isoDate}
              className={`bg-surface rounded-xl p-1.5 shadow-[0_4px_12px_rgba(58,52,44,0.05)] min-h-[92px] ${
                day.isCurrentMonth ? "" : "opacity-45"
              }`}
            >
              <div
                className={`w-[20px] h-[20px] rounded-full flex items-center justify-center text-[11px] font-semibold ${
                  day.isToday ? "bg-accent-strong text-white" : "text-ink"
                }`}
              >
                {day.date}
              </div>
              <div className="flex flex-col gap-1 mt-1">
                {dayAssignments.slice(0, MAX_VISIBLE).map((assignment) => {
                  const color = subjectColor(assignment.subjectId);
                  return (
                    <div
                      key={assignment.id}
                      onClick={() => setSelectedAssignmentId(assignment.id)}
                      className={`text-[10px] leading-tight px-1.5 py-0.5 rounded cursor-pointer truncate ${
                        assignment.status === "done" ? "line-through opacity-60" : ""
                      }`}
                      style={{ backgroundColor: `${color}22`, borderLeft: `2px solid ${color}` }}
                      title={`${assignment.subjectName}: ${assignment.title}`}
                    >
                      {assignment.title}
                    </div>
                  );
                })}
                {dayAssignments.length > MAX_VISIBLE && (
                  <div className="text-[10px] text-ink-muted px-1.5">+{dayAssignments.length - MAX_VISIBLE} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {subjectFilterOptions.length > 0 && (
        <div className="flex items-center gap-2 mt-6 flex-wrap">
          {subjectFilterOptions.map(([id, name]) => {
            const active = filterSubjectId === id;
            const dimmed = filterSubjectId !== null && !active;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilterSubjectId(active ? null : id)}
                aria-pressed={active}
                title={active ? `Showing only ${name} — click to show everything` : `Show only ${name}`}
                className={`text-[11.5px] px-2.5 py-1 rounded-full ${
                  active ? "bg-accent-strong text-white font-semibold" : "bg-base text-ink-muted"
                } ${dimmed ? "opacity-45" : ""}`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {childUsers.length > 1 && (
        <div className="flex items-center gap-4 mt-4">
          {childUsers
            .filter((c) => c.calendarColor)
            .map((c) => {
              const active = filterChildId === c.id;
              const dimmed = filterChildId !== null && !active;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilterChildId(active ? null : c.id)}
                  aria-pressed={active}
                  title={active ? `Showing only ${c.fullName} — click to show everyone` : `Show only ${c.fullName}`}
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-full ${active ? "bg-accent/[0.15]" : ""} ${
                    dimmed ? "opacity-45" : ""
                  }`}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.calendarColor! }} />
                  <div className={`text-[11.5px] ${active ? "text-ink font-semibold" : "text-ink-muted"}`}>{c.fullName}</div>
                </button>
              );
            })}
        </div>
      )}

      <div className="mt-6">
        {toggleError && <p className="text-xs text-urgent mb-4">{toggleError}</p>}

        {renderSection("Overdue", "text-urgent", "overdue", groups.overdue)}
        {renderSection("Today", "text-ink", "today", groups.today)}
        {renderSection("This Week", "text-ink", "week", groups.week)}
        {renderSection("Completed", "text-ink-muted", "completed", groups.completed)}
      </div>

      {selectedAssignment && (
        <AssignmentDetailModal
          assignment={selectedAssignment}
          owner={membersById.get(selectedAssignment.ownerId)}
          assigner={membersById.get(selectedAssignment.assignedBy)}
          signedOffByName={
            selectedAssignment.signedOffBy ? membersById.get(selectedAssignment.signedOffBy)?.fullName : undefined
          }
          onClose={() => setSelectedAssignmentId(null)}
          onEdit={() => setFormMode("edit")}
          onDeleted={() => {
            setSelectedAssignmentId(null);
            router.refresh();
          }}
        />
      )}

      {formMode && (
        <AssignmentFormModal
          mode={formMode}
          initial={formMode === "edit" ? selectedAssignment : null}
          childUsers={childUsers}
          currentUserId={currentUserId}
          canAssignToOthers={canAssignToOthers}
          canGradeOwnerIds={canGradeOwnerIds}
          onClose={() => setFormMode(null)}
          onSaved={() => {
            setFormMode(null);
            setSelectedAssignmentId(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function AssignmentDetailModal({
  assignment,
  owner,
  assigner,
  signedOffByName,
  onClose,
  onEdit,
  onDeleted,
}: {
  assignment: AssignmentData;
  owner: FamilyMemberOption | undefined;
  assigner: FamilyMemberOption | undefined;
  signedOffByName: string | undefined;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  useEscapeKey(true, onClose);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const done = assignment.status === "done";

  async function handleDelete(scope: RecurrenceScope) {
    setDeleting(true);
    setError(null);
    try {
      await deleteTask(assignment.id, scope);
      onDeleted();
    } catch (err) {
      setError(err instanceof TasksApiError ? err.message : "Something went wrong. Try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/[0.35] flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl p-8 w-[420px] shadow-[0_24px_60px_rgba(58,52,44,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: owner?.calendarColor ?? "#9C6A2E" }} />
          <div className="text-xs font-semibold text-ink-muted">{owner?.fullName ?? "?"}</div>
        </div>
        <div className={`font-display text-xl font-semibold mt-2.5 ${done ? "line-through text-ink-muted" : "text-ink"}`}>
          {assignment.title}
        </div>
        <div className="text-[13px] text-ink-muted mt-1.5">
          Due {assignment.dueDate ? formatShortDate(assignment.dueDate) : "—"}
          {assignment.assignedBy !== assignment.ownerId && ` · assigned by ${assigner?.fullName ?? "?"}`}
        </div>
        {assignment.description && (
          <div className="text-[13.5px] text-ink mt-4 leading-relaxed">{assignment.description}</div>
        )}
        <div className="flex items-center gap-2.5 mt-4.5">
          <div className="text-[11.5px] text-ink-muted bg-base px-2.5 py-1 rounded-full">{done ? "Completed" : "Pending"}</div>
          {assignment.recurrenceFrequency && (
            <div className="text-[11.5px] text-ink-muted bg-base px-2.5 py-1 rounded-full">
              Repeats {RECURRENCE_LABELS[assignment.recurrenceFrequency]}
            </div>
          )}
        </div>

        <div className="mt-4.5 bg-base rounded-xl p-4">
          <div className="text-[11px] font-semibold tracking-wide text-accent-strong uppercase">{assignment.subjectName}</div>
          {assignment.curriculumReference && (
            <div className="text-[12.5px] text-ink mt-1">{assignment.curriculumReference}</div>
          )}
          {(assignment.gradeOrScore || assignment.parentNotes || assignment.signedOffAt) && (
            <div className="mt-3 pt-3 border-t border-ink/[0.07] flex flex-col gap-1.5">
              {assignment.gradeOrScore && (
                <div className="text-[12.5px] text-ink">
                  <span className="text-ink-muted">Grade/Score: </span>
                  {assignment.gradeOrScore}
                </div>
              )}
              {assignment.parentNotes && (
                <div className="text-[12.5px] text-ink">
                  <span className="text-ink-muted">Notes: </span>
                  {assignment.parentNotes}
                </div>
              )}
              {assignment.signedOffAt && (
                <div className="text-[11.5px] text-calm">
                  Signed off by {signedOffByName ?? "?"} · {formatShortDate(assignment.signedOffAt.slice(0, 10))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-urgent mt-3">{error}</p>}

        {confirmingDelete ? (
          <div className="mt-6">
            <p className="text-[12.5px] text-ink-muted mb-2.5">Delete which assignments?</p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => handleDelete("this")} disabled={deleting} className="text-[13px] font-semibold text-urgent text-left disabled:opacity-60">
                Just this assignment
              </button>
              <button type="button" onClick={() => handleDelete("future")} disabled={deleting} className="text-[13px] font-semibold text-urgent text-left disabled:opacity-60">
                This and future assignments
              </button>
              <button type="button" onClick={() => handleDelete("series")} disabled={deleting} className="text-[13px] font-semibold text-urgent text-left disabled:opacity-60">
                All assignments in the series
              </button>
            </div>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="text-[12.5px] text-ink-muted mt-3">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 mt-6">
            {assignment.canEdit && (
              <button
                type="button"
                onClick={() => (assignment.recurrenceId ? setConfirmingDelete(true) : handleDelete("this"))}
                disabled={deleting}
                className="text-[13px] font-semibold text-urgent disabled:opacity-60"
              >
                Delete
              </button>
            )}
            <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">
              Close
            </button>
            {(assignment.canEdit || assignment.canGrade) && (
              <button
                type="button"
                onClick={onEdit}
                className="text-[13px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AssignmentFormModal({
  mode,
  initial,
  childUsers,
  currentUserId,
  canAssignToOthers,
  canGradeOwnerIds,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: AssignmentData | null;
  childUsers: FamilyMemberOption[];
  currentUserId: string;
  canAssignToOthers: boolean;
  canGradeOwnerIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  useEscapeKey(true, onClose);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  // Assign to only children (Steven, 2026-08-23) — default to the first
  // child if an Admin/Super Admin is creating one, otherwise self (a child
  // logging their own homework, same self-assign story Homeschool.md lists).
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? (canAssignToOthers ? childUsers[0]?.id ?? currentUserId : currentUserId));
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency | "">(initial?.recurrenceFrequency ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingSaveScope, setConfirmingSaveScope] = useState(false);

  // Subject picker follows the Document Category pattern — existing name
  // from the fetched list, or "__new__" with a free-text box. Required here
  // (unlike Tasks, which has no Subject field at all) since every item on
  // this screen is homework by definition.
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string>(initial ? "__new__" : "");
  const [newSubjectText, setNewSubjectText] = useState(initial?.subjectName ?? "");
  const [curriculumReference, setCurriculumReference] = useState(initial?.curriculumReference ?? "");
  const [gradeOrScore, setGradeOrScore] = useState(initial?.gradeOrScore ?? "");
  const [parentNotes, setParentNotes] = useState(initial?.parentNotes ?? "");
  const [signedOff, setSignedOff] = useState(!!initial?.signedOffAt);

  useEffect(() => {
    getSubjects()
      .then((subs) => {
        setSubjects(subs);
        if (initial?.subjectName) {
          const match = subs.find((s) => s.name === initial.subjectName);
          if (match) setSelectedSubject(match.name);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSubjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGradeSelected = canGradeOwnerIds.includes(ownerId);

  async function handleSave(editScope: RecurrenceScope) {
    if (!title.trim() || !dueDate) {
      setError("Title and due date are required.");
      return;
    }
    const subjectValue = selectedSubject === "__new__" ? newSubjectText.trim() : selectedSubject;
    if (!subjectValue) {
      setError("Choose a subject, or add a new one.");
      return;
    }
    setSaving(true);
    setError(null);
    const input: TaskInput = {
      title: title.trim(),
      description: description.trim() || null,
      dueDate,
      // Homeschool.md: assignments are always public — no visibility choice
      // on this screen, unlike Tasks.
      visibility: "public",
      ownerId,
      recurrence: recurrence || null,
      subject: subjectValue,
      curriculumReference: curriculumReference.trim() || null,
      ...(canGradeSelected
        ? { gradeOrScore: gradeOrScore.trim() || null, parentNotes: parentNotes.trim() || null, signedOff }
        : {}),
    };
    try {
      if (mode === "create") {
        await createTask(input);
      } else if (initial) {
        await updateTask(initial.id, input, editScope);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof TasksApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/[0.35] flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl p-8 w-[440px] shadow-[0_24px_60px_rgba(58,52,44,0.25)] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-lg font-semibold text-ink">
          {mode === "create" ? "Add Assignment" : "Edit Assignment"}
        </div>

        <div className="mt-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Title</label>
            <input
              type="text"
              placeholder="e.g. Chapter 4 Review"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Description</label>
            <textarea
              placeholder="Add details…"
              rows={2}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink placeholder:text-ink-muted/70 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] font-body text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          {mode === "create" ? (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Repeats</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as RecurrenceFrequency | "")}
                className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">Does not repeat</option>
                {RECURRENCE_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {RECURRENCE_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            initial?.recurrenceFrequency && (
              <p className="text-[12px] text-ink-muted">
                Repeats {RECURRENCE_LABELS[initial.recurrenceFrequency]} — can&apos;t be changed here; delete this
                series and create a new one to change how often it repeats. Due date changes below only apply to
                this occurrence.
              </p>
            )
          )}
          {canAssignToOthers && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Assign to</label>
              {childUsers.length === 0 ? (
                <p className="text-xs text-ink-muted">No children on this account yet.</p>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {childUsers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setOwnerId(c.id)}
                      className={`text-xs px-3 py-1.5 rounded-full ${
                        ownerId === c.id ? "bg-accent-strong text-white" : "bg-base text-ink"
                      }`}
                    >
                      {c.fullName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Subject</label>
            {loadingSubjects ? (
              <p className="text-xs text-ink-muted">Loading subjects…</p>
            ) : (
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="" disabled>
                  Choose a subject…
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
                <option value="__new__">+ New subject</option>
              </select>
            )}
            {selectedSubject === "__new__" && (
              <input
                type="text"
                value={newSubjectText}
                onChange={(e) => setNewSubjectText(e.target.value)}
                placeholder="e.g. Math, Reading, Science"
                autoFocus
                className="w-full mt-2 px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Curriculum Reference (optional)</label>
            <input
              type="text"
              placeholder="e.g. Saxon Math Lesson 42"
              value={curriculumReference}
              onChange={(e) => setCurriculumReference(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          {canGradeSelected && (
            <div className="bg-base rounded-xl p-4 flex flex-col gap-3">
              <div className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Grading (Admin/Super Admin only)
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Grade / Score</label>
                <input
                  type="text"
                  placeholder="e.g. B+, 18/20, Complete"
                  value={gradeOrScore}
                  onChange={(e) => setGradeOrScore(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">Parent Notes</label>
                <textarea
                  rows={2}
                  value={parentNotes}
                  onChange={(e) => setParentNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] text-ink placeholder:text-ink-muted/70 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={signedOff}
                  onChange={(e) => setSignedOff(e.target.checked)}
                  className="accent-accent-strong"
                />
                Signed off — reviewed by a parent
              </label>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-urgent mt-3">{error}</p>}

        {confirmingSaveScope ? (
          <div className="mt-4">
            <p className="text-[12.5px] text-ink-muted mb-2.5">Apply these changes to which assignments?</p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => handleSave("this")} disabled={saving} className="text-[13px] font-semibold text-ink text-left disabled:opacity-60">
                Just this assignment
              </button>
              <button type="button" onClick={() => handleSave("future")} disabled={saving} className="text-[13px] font-semibold text-ink text-left disabled:opacity-60">
                This and future assignments
              </button>
              <button type="button" onClick={() => handleSave("series")} disabled={saving} className="text-[13px] font-semibold text-ink text-left disabled:opacity-60">
                All assignments in the series
              </button>
            </div>
            <button type="button" onClick={() => setConfirmingSaveScope(false)} className="text-[12.5px] text-ink-muted mt-3">
              Back
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 mt-6">
            <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => (mode === "edit" && initial?.recurrenceId ? setConfirmingSaveScope(true) : handleSave("this"))}
              disabled={saving}
              className="text-[13px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full disabled:opacity-70"
            >
              {saving ? "Saving…" : "Save Assignment"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
