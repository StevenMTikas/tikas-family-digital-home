// Pure grouping logic for the Tasks list (Tasks.md: "Task list (weekly-ish
// view, consistent with Calendar's MVP scope)" — Overdue / Today / This Week
// / Completed sections, each rendered only if non-empty).

export interface GroupableTask {
  id: string;
  dueDate: string | null; // YYYY-MM-DD
  status: "not_done" | "done";
}

export interface TaskGroups<T extends GroupableTask> {
  overdue: T[];
  today: T[];
  week: T[];
  completed: T[];
}

/**
 * Buckets tasks by due date relative to `todayIso`. A task due more than 7
 * days out (and not yet due) falls into none of these buckets and simply
 * doesn't render, matching the design's "weekly-ish" scope — same as
 * Calendar's hard week boundary.
 */
export function groupTasks<T extends GroupableTask>(tasks: T[], todayIso: string): TaskGroups<T> {
  const groups: TaskGroups<T> = { overdue: [], today: [], week: [], completed: [] };
  const weekEndIso = addDaysIso(todayIso, 7);

  for (const task of tasks) {
    if (task.status === "done") {
      groups.completed.push(task);
      continue;
    }
    if (!task.dueDate) continue;

    if (task.dueDate < todayIso) {
      groups.overdue.push(task);
    } else if (task.dueDate === todayIso) {
      groups.today.push(task);
    } else if (task.dueDate <= weekEndIso) {
      groups.week.push(task);
    }
  }

  return groups;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
