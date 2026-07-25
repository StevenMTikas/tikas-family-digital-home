import { describe, it, expect } from "vitest";
import { groupTasks, type GroupableTask } from "./grouping";

function task(id: string, dueDate: string | null, status: "not_done" | "done" = "not_done"): GroupableTask {
  return { id, dueDate, status };
}

const TODAY = "2026-07-25";

describe("groupTasks", () => {
  it("buckets a past-due, incomplete task as overdue", () => {
    const groups = groupTasks([task("a", "2026-07-20")], TODAY);
    expect(groups.overdue.map((t) => t.id)).toEqual(["a"]);
  });

  it("buckets a task due exactly today as today, not overdue", () => {
    const groups = groupTasks([task("a", TODAY)], TODAY);
    expect(groups.today.map((t) => t.id)).toEqual(["a"]);
    expect(groups.overdue).toHaveLength(0);
  });

  it("buckets a task due within the next 7 days as week", () => {
    const groups = groupTasks([task("a", "2026-08-01")], TODAY);
    expect(groups.week.map((t) => t.id)).toEqual(["a"]);
  });

  it("excludes a task due more than 7 days out entirely", () => {
    const groups = groupTasks([task("a", "2026-08-05")], TODAY);
    expect(groups.overdue).toHaveLength(0);
    expect(groups.today).toHaveLength(0);
    expect(groups.week).toHaveLength(0);
    expect(groups.completed).toHaveLength(0);
  });

  it("buckets a completed task as completed regardless of due date, including overdue or undated", () => {
    const groups = groupTasks(
      [task("a", "2026-07-01", "done"), task("b", null, "done")],
      TODAY
    );
    expect(groups.completed.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(groups.overdue).toHaveLength(0);
  });

  it("excludes an incomplete task with no due date from every bucket", () => {
    const groups = groupTasks([task("a", null)], TODAY);
    expect(groups.overdue).toHaveLength(0);
    expect(groups.today).toHaveLength(0);
    expect(groups.week).toHaveLength(0);
    expect(groups.completed).toHaveLength(0);
  });

  it("handles the 7-day boundary as inclusive", () => {
    const withinBoundary = groupTasks([task("a", "2026-08-01")], TODAY); // exactly +7 days
    expect(withinBoundary.week.map((t) => t.id)).toEqual(["a"]);
  });
});
