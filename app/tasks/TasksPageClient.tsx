"use client";

// Client half of the Tasks screen: Overdue/Today/This Week/Completed
// sections, task detail modal, add/edit form modal. Recreated from the
// design handoff (Tikas Tasks.dc.html) — the shared sidebar/top-bar/Assistant
// chrome shown in that mockup isn't built yet (Navigation.md's shell is
// Phase 7), so this renders as a standalone page like the other module pages.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

const RECURRENCE_LABELS: Record<RecurrenceFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  yearly: "Yearly",
};

export interface TaskData extends Task {}

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

function dueLabel(task: TaskData, group: "overdue" | "today" | "week" | "completed"): string {
  if (!task.dueDate) return "";
  if (group === "overdue") return `Overdue — ${formatShortDate(task.dueDate)}`;
  if (group === "today") return "Today";
  return formatShortDate(task.dueDate);
}

export default function TasksPageClient({
  tasks,
  familyMembers,
  currentUserId,
  canAssignToOthers,
  canGradeOwnerIds,
  todayIso,
}: {
  tasks: TaskData[];
  familyMembers: FamilyMemberOption[];
  currentUserId: string;
  canAssignToOthers: boolean;
  canGradeOwnerIds: string[];
  todayIso: string;
}) {
  const router = useRouter();
  const membersById = new Map(familyMembers.map((m) => [m.id, m]));

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  // Default is everyone (null) — clicking a name filters to just their tasks; clicking the same name again clears it. Same pattern as Calendar's legend (Calendar.md).
  const [filterPersonId, setFilterPersonId] = useState<string | null>(null);
  // Same click-to-filter pattern, for Subject (Homeschool.md) — built from
  // whatever subjects actually appear among the visible tasks, not the full
  // managed Subject list (a subject with no current homework wouldn't be a
  // useful filter chip).
  const [filterSubjectId, setFilterSubjectId] = useState<string | null>(null);
  const subjectFilterOptions = Array.from(
    new Map(
      tasks.filter((t) => t.subjectId).map((t) => [t.subjectId as string, t.subjectName as string])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const visibleTasks = tasks
    .filter((t) => !filterPersonId || t.ownerId === filterPersonId)
    .filter((t) => !filterSubjectId || t.subjectId === filterSubjectId);
  const groups = groupTasks(visibleTasks, todayIso);
  const openCount = visibleTasks.filter((t) => t.status !== "done").length;
  const completedCount = visibleTasks.filter((t) => t.status === "done").length;
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  async function toggleStatus(task: TaskData, e: React.MouseEvent) {
    e.stopPropagation();
    if (!task.canComplete) return;
    setToggleError(null);
    try {
      await setTaskStatus(task.id, task.status === "done" ? "not_done" : "done");
      router.refresh();
    } catch (err) {
      setToggleError(err instanceof TasksApiError ? err.message : "Something went wrong.");
    }
  }

  function renderSection(
    label: string,
    labelColorClass: string,
    group: "overdue" | "today" | "week" | "completed",
    list: TaskData[]
  ) {
    if (list.length === 0) return null;
    return (
      <div className="mb-6">
        <div className={`text-xs font-semibold tracking-wide uppercase mb-2.5 ${labelColorClass}`}>{label}</div>
        <div className="bg-surface rounded-2xl px-4 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
          {list.map((task, i) => {
            const owner = membersById.get(task.ownerId);
            const done = task.status === "done";
            return (
              <div
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className={`flex items-center gap-3.5 py-3 cursor-pointer ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}
              >
                <button
                  type="button"
                  onClick={(e) => toggleStatus(task, e)}
                  disabled={!task.canComplete}
                  className={`w-[19px] h-[19px] rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    done ? "border-calm" : "border-ink/20"
                  } ${task.canComplete ? "cursor-pointer" : "cursor-default"}`}
                  aria-label={done ? "Mark not done" : "Mark done"}
                >
                  {done && <span className="text-calm text-[10px]">✓</span>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {task.visibility === "private" && <span className="text-[10px]">🔒</span>}
                    <div
                      className={`text-[14.5px] ${done ? "text-ink-muted line-through" : "text-ink"}`}
                    >
                      {task.title}
                    </div>
                    {task.subjectName && (
                      <div className="text-[10.5px] text-accent-strong bg-accent/[0.12] px-2 py-0.5 rounded-full">
                        {task.subjectName}
                      </div>
                    )}
                  </div>
                  <div
                    className={`text-[11.5px] mt-0.5 ${
                      group === "overdue" && !done ? "text-urgent" : "text-ink-muted"
                    }`}
                  >
                    {dueLabel(task, group)}
                    {task.assignedBy !== task.ownerId && ` · assigned by ${membersById.get(task.assignedBy)?.fullName ?? "?"}`}
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
    <main className="p-6 max-w-[760px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium">Tasks</h1>
          <p className="text-[12.5px] text-ink-muted mt-0.5">
            {openCount} open · {completedCount} completed
          </p>
        </div>
      </div>

      {subjectFilterOptions.length > 0 && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
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

      <div className="flex items-center justify-between mt-6 mb-5">
        <div className="flex items-center gap-4">
          {familyMembers
            .filter((m) => m.calendarColor)
            .map((m) => {
              const active = filterPersonId === m.id;
              const dimmed = filterPersonId !== null && !active;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setFilterPersonId(active ? null : m.id)}
                  aria-pressed={active}
                  title={active ? `Showing only ${m.fullName} — click to show everyone` : `Show only ${m.fullName}`}
                  className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded-full ${active ? "bg-accent/[0.15]" : ""} ${
                    dimmed ? "opacity-45" : ""
                  }`}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.calendarColor! }} />
                  <div className={`text-[11.5px] ${active ? "text-ink font-semibold" : "text-ink-muted"}`}>{m.fullName}</div>
                </button>
              );
            })}
        </div>
        <button
          type="button"
          onClick={() => setFormMode("create")}
          className="h-[34px] px-4.5 rounded-xl bg-accent-strong text-white text-[13px] font-semibold"
        >
          + Add Task
        </button>
      </div>

      {toggleError && <p className="text-xs text-urgent mb-4">{toggleError}</p>}

      {renderSection("Overdue", "text-urgent", "overdue", groups.overdue)}
      {renderSection("Today", "text-ink", "today", groups.today)}
      {renderSection("This Week", "text-ink", "week", groups.week)}
      {renderSection("Completed", "text-ink-muted", "completed", groups.completed)}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          owner={membersById.get(selectedTask.ownerId)}
          assigner={membersById.get(selectedTask.assignedBy)}
          signedOffByName={selectedTask.signedOffBy ? membersById.get(selectedTask.signedOffBy)?.fullName : undefined}
          onClose={() => setSelectedTaskId(null)}
          onEdit={() => setFormMode("edit")}
          onDeleted={() => {
            setSelectedTaskId(null);
            router.refresh();
          }}
        />
      )}

      {formMode && (
        <TaskFormModal
          mode={formMode}
          initial={formMode === "edit" ? selectedTask : null}
          familyMembers={familyMembers}
          currentUserId={currentUserId}
          canAssignToOthers={canAssignToOthers}
          canGradeOwnerIds={canGradeOwnerIds}
          onClose={() => setFormMode(null)}
          onSaved={() => {
            setFormMode(null);
            setSelectedTaskId(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function TaskDetailModal({
  task,
  owner,
  assigner,
  signedOffByName,
  onClose,
  onEdit,
  onDeleted,
}: {
  task: TaskData;
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
  const done = task.status === "done";

  async function handleDelete(scope: RecurrenceScope) {
    setDeleting(true);
    setError(null);
    try {
      await deleteTask(task.id, scope);
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
        <div
          className={`font-display text-xl font-semibold mt-2.5 ${done ? "line-through text-ink-muted" : "text-ink"}`}
        >
          {task.title}
        </div>
        <div className="text-[13px] text-ink-muted mt-1.5">
          Due {task.dueDate ? formatShortDate(task.dueDate) : "—"}
          {task.assignedBy !== task.ownerId && ` · assigned by ${assigner?.fullName ?? "?"}`}
        </div>
        {task.description && (
          <div className="text-[13.5px] text-ink mt-4 leading-relaxed">{task.description}</div>
        )}
        <div className="flex items-center gap-2.5 mt-4.5">
          <div className="text-[11.5px] text-ink-muted bg-base px-2.5 py-1 rounded-full">
            {task.visibility === "private" ? "Private" : "Public"}
          </div>
          <div className="text-[11.5px] text-ink-muted bg-base px-2.5 py-1 rounded-full">
            {done ? "Completed" : "Pending"}
          </div>
          {task.recurrenceFrequency && (
            <div className="text-[11.5px] text-ink-muted bg-base px-2.5 py-1 rounded-full">
              Repeats {RECURRENCE_LABELS[task.recurrenceFrequency]}
            </div>
          )}
        </div>

        {task.subjectName && (
          <div className="mt-4.5 bg-base rounded-xl p-4">
            <div className="text-[11px] font-semibold tracking-wide text-accent-strong uppercase">
              {task.subjectName}
            </div>
            {task.curriculumReference && (
              <div className="text-[12.5px] text-ink mt-1">{task.curriculumReference}</div>
            )}
            {(task.gradeOrScore || task.parentNotes || task.signedOffAt) && (
              <div className="mt-3 pt-3 border-t border-ink/[0.07] flex flex-col gap-1.5">
                {task.gradeOrScore && (
                  <div className="text-[12.5px] text-ink">
                    <span className="text-ink-muted">Grade/Score: </span>
                    {task.gradeOrScore}
                  </div>
                )}
                {task.parentNotes && (
                  <div className="text-[12.5px] text-ink">
                    <span className="text-ink-muted">Notes: </span>
                    {task.parentNotes}
                  </div>
                )}
                {task.signedOffAt && (
                  <div className="text-[11.5px] text-calm">
                    Signed off by {signedOffByName ?? "?"} · {formatShortDate(task.signedOffAt.slice(0, 10))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-urgent mt-3">{error}</p>}

        {confirmingDelete ? (
          <div className="mt-6">
            <p className="text-[12.5px] text-ink-muted mb-2.5">Delete which tasks?</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleDelete("this")}
                disabled={deleting}
                className="text-[13px] font-semibold text-urgent text-left disabled:opacity-60"
              >
                Just this task
              </button>
              <button
                type="button"
                onClick={() => handleDelete("future")}
                disabled={deleting}
                className="text-[13px] font-semibold text-urgent text-left disabled:opacity-60"
              >
                This and future tasks
              </button>
              <button
                type="button"
                onClick={() => handleDelete("series")}
                disabled={deleting}
                className="text-[13px] font-semibold text-urgent text-left disabled:opacity-60"
              >
                All tasks in the series
              </button>
            </div>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="text-[12.5px] text-ink-muted mt-3">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 mt-6">
            {task.canEdit && (
              <button
                type="button"
                onClick={() => (task.recurrenceId ? setConfirmingDelete(true) : handleDelete("this"))}
                disabled={deleting}
                className="text-[13px] font-semibold text-urgent disabled:opacity-60"
              >
                Delete
              </button>
            )}
            <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">
              Close
            </button>
            {task.canEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="text-[13px] font-semibold text-white bg-accent-strong px-4.5 py-2 rounded-full"
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

function TaskFormModal({
  mode,
  initial,
  familyMembers,
  currentUserId,
  canAssignToOthers,
  canGradeOwnerIds,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: TaskData | null;
  familyMembers: FamilyMemberOption[];
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
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? currentUserId);
  const [visibility, setVisibility] = useState<"public" | "private">(initial?.visibility ?? "public");
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency | "">(initial?.recurrenceFrequency ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingSaveScope, setConfirmingSaveScope] = useState(false);

  // Homeschool.md: Subject picker follows the Document Category pattern —
  // "" = no subject, "__new__" = the free-text box is the source of truth
  // (also the default for an existing subject until the fetched list proves
  // an exact-name match, same as EditDocumentModal's category picker),
  // otherwise one of `subjects`' names.
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<string>(initial?.subjectName ? "__new__" : "");
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
  const hasSubject = selectedSubject !== "";

  async function handleSave(editScope: RecurrenceScope) {
    if (!title.trim() || !dueDate) {
      setError("Title and due date are required.");
      return;
    }
    if (selectedSubject === "__new__" && !newSubjectText.trim()) {
      setError("Enter a subject name, or choose one from the list.");
      return;
    }
    setSaving(true);
    setError(null);
    const subject = selectedSubject === "" ? "" : selectedSubject === "__new__" ? newSubjectText.trim() : selectedSubject;
    const input: TaskInput = {
      title: title.trim(),
      description: description.trim() || null,
      dueDate,
      visibility,
      ownerId,
      recurrence: recurrence || null,
      subject,
      curriculumReference: hasSubject ? curriculumReference.trim() || null : null,
      ...(hasSubject && canGradeSelected
        ? {
            gradeOrScore: gradeOrScore.trim() || null,
            parentNotes: parentNotes.trim() || null,
            signedOff,
          }
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
        className="bg-surface rounded-2xl p-8 w-[440px] shadow-[0_24px_60px_rgba(58,52,44,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-lg font-semibold text-ink">
          {mode === "create" ? "Add Task" : "Edit Task"}
        </div>

        <div className="mt-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Title</label>
            <input
              type="text"
              placeholder="e.g. Clean room"
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
              <div className="flex gap-2 flex-wrap">
                {familyMembers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setOwnerId(m.id)}
                    className={`text-xs px-3 py-1.5 rounded-full ${
                      ownerId === m.id ? "bg-accent-strong text-white" : "bg-base text-ink"
                    }`}
                  >
                    {m.fullName}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Subject (optional)</label>
            {loadingSubjects ? (
              <p className="text-xs text-ink-muted">Loading subjects…</p>
            ) : (
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                <option value="">No subject — this is a regular task</option>
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
          {hasSubject && (
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
          )}
          {hasSubject && canGradeSelected && (
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
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Visibility</label>
            <div className="flex rounded-xl overflow-hidden border border-ink/15 w-fit">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`px-4 py-1.5 text-xs font-semibold ${
                  visibility === "public" ? "bg-accent-strong text-white" : "bg-surface text-ink-muted"
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`px-4 py-1.5 text-xs font-semibold ${
                  visibility === "private" ? "bg-accent-strong text-white" : "bg-surface text-ink-muted"
                }`}
              >
                Private
              </button>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-urgent mt-3">{error}</p>}

        {confirmingSaveScope ? (
          <div className="mt-4">
            <p className="text-[12.5px] text-ink-muted mb-2.5">Apply these changes to which tasks?</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleSave("this")}
                disabled={saving}
                className="text-[13px] font-semibold text-ink text-left disabled:opacity-60"
              >
                Just this task
              </button>
              <button
                type="button"
                onClick={() => handleSave("future")}
                disabled={saving}
                className="text-[13px] font-semibold text-ink text-left disabled:opacity-60"
              >
                This and future tasks
              </button>
              <button
                type="button"
                onClick={() => handleSave("series")}
                disabled={saving}
                className="text-[13px] font-semibold text-ink text-left disabled:opacity-60"
              >
                All tasks in the series
              </button>
            </div>
            <button
              type="button"
              onClick={() => setConfirmingSaveScope(false)}
              className="text-[12.5px] text-ink-muted mt-3"
            >
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
              {saving ? "Saving…" : "Save Task"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
