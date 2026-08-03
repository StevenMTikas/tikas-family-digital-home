process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { PATCH, DELETE } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, admin_scope) VALUES ('vee', 'vee.test', 'x', 'Vee', 'admin', '["malachi"]')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user')`
  ).run();
});

beforeEach(() => {
  getDb().exec(`DELETE FROM event_assignments; DELETE FROM events;`);
});

function insertEvent(overrides: Partial<Record<string, unknown>> = {}) {
  const id = (overrides.id as string) ?? randomUUID();
  getDb()
    .prepare(
      `INSERT INTO events (id, title, description, date_time, created_by, visibility, category, reminder_lead_time, recurrence_id, recurrence_frequency, recurrence_until)
       VALUES (@id, @title, @description, @date_time, @created_by, @visibility, @category, @reminder_lead_time, @recurrence_id, @recurrence_frequency, @recurrence_until)`
    )
    .run({
      id,
      title: "Weekly Standup",
      description: null,
      date_time: "2026-01-01T09:00:00",
      created_by: "dad",
      visibility: "public",
      category: null,
      reminder_lead_time: null,
      recurrence_id: null,
      recurrence_frequency: null,
      recurrence_until: null,
      ...overrides,
    });
  return id;
}

function patchReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/calendar/x", {
    method: "PATCH",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(userId: string | null, scope?: string) {
  const url = scope ? `http://localhost/api/calendar/x?scope=${scope}` : "http://localhost/api/calendar/x";
  return new NextRequest(url, {
    method: "DELETE",
    headers: userId ? { "x-user-id": userId } : {},
  });
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// PATCH/DELETE always return a NextResponse on every real code path (verified
// by reading route.ts), but TS's inferred external return type for both
// picks up a stray `| undefined` that route.ts itself doesn't see internally
// — these thin wrappers assert that away once, rather than sprinkling `!`
// across every call site.
async function callPatch(...args: Parameters<typeof PATCH>) {
  const res = await PATCH(...args);
  if (!res) throw new Error("PATCH unexpectedly returned no response");
  return res;
}
async function callDelete(...args: Parameters<typeof DELETE>) {
  const res = await DELETE(...args);
  if (!res) throw new Error("DELETE unexpectedly returned no response");
  return res;
}

describe("PATCH /api/calendar/[id]", () => {
  it("requires authentication", async () => {
    const id = insertEvent();
    const res = await callPatch(patchReq(null, { title: "New" }), idParams(id));
    expect(res.status).toBe(401);
  });

  it("404s for a nonexistent event", async () => {
    const res = await callPatch(patchReq("dad", { title: "New" }), idParams(randomUUID()));
    expect(res.status).toBe(404);
  });

  it("forbids an assigned participant who is neither creator nor admin from editing", async () => {
    const id = insertEvent({ created_by: "dad" });
    getDb().prepare(`INSERT INTO event_assignments (event_id, user_id) VALUES (?, ?)`).run(id, "malachi");

    const res = await callPatch(patchReq("malachi", { title: "Hijacked" }), idParams(id));
    expect(res.status).toBe(403);
  });

  it("allows the creator to edit their own event", async () => {
    const id = insertEvent({ created_by: "malachi" });
    const res = await callPatch(patchReq("malachi", { title: "Updated by owner" }), idParams(id));
    expect(res.status).toBe(200);
    expect((await res.json()).title).toBe("Updated by owner");
  });

  it("allows an admin scoped to the creator to edit", async () => {
    const id = insertEvent({ created_by: "malachi" });
    const res = await callPatch(patchReq("vee", { title: "Updated by admin" }), idParams(id));
    expect(res.status).toBe(200);
  });

  it("rejects a request with no recognized changes", async () => {
    const id = insertEvent();
    const res = await callPatch(patchReq("dad", {}), idParams(id));
    expect(res.status).toBe(400);
  });

  it("rejects clearing assigneeIds to an empty array", async () => {
    const id = insertEvent();
    const res = await callPatch(patchReq("dad", { assigneeIds: [] }), idParams(id));
    expect(res.status).toBe(400);
  });

  describe("recurrence scope", () => {
    function insertSeries() {
      const recurrenceId = randomUUID();
      const first = insertEvent({ recurrence_id: recurrenceId, recurrence_frequency: "weekly", date_time: "2026-01-01T09:00:00" });
      const second = insertEvent({ recurrence_id: recurrenceId, recurrence_frequency: "weekly", date_time: "2026-01-08T09:00:00" });
      const third = insertEvent({ recurrence_id: recurrenceId, recurrence_frequency: "weekly", date_time: "2026-01-15T09:00:00" });
      return { recurrenceId, first, second, third };
    }

    it('editScope "this" (default) only changes the single occurrence', async () => {
      const { first, second } = insertSeries();
      await callPatch(patchReq("dad", { title: "Just this one" }), idParams(first));

      const titles = getDb().prepare(`SELECT id, title FROM events ORDER BY date_time`).all() as {
        id: string;
        title: string;
      }[];
      expect(titles.find((r) => r.id === first)?.title).toBe("Just this one");
      expect(titles.find((r) => r.id === second)?.title).toBe("Weekly Standup");
    });

    it('editScope "future" changes the target occurrence and every later one, not earlier ones', async () => {
      const { first, second, third } = insertSeries();
      await callPatch(patchReq("dad", { title: "Renamed forward", editScope: "future" }), idParams(second));

      const rows = getDb().prepare(`SELECT id, title FROM events`).all() as { id: string; title: string }[];
      expect(rows.find((r) => r.id === first)?.title).toBe("Weekly Standup");
      expect(rows.find((r) => r.id === second)?.title).toBe("Renamed forward");
      expect(rows.find((r) => r.id === third)?.title).toBe("Renamed forward");
    });

    it('editScope "series" changes every occurrence including earlier ones', async () => {
      const { first, second, third } = insertSeries();
      await callPatch(patchReq("dad", { title: "Renamed whole series", editScope: "series" }), idParams(third));

      const rows = getDb().prepare(`SELECT id, title FROM events`).all() as { id: string; title: string }[];
      expect(rows.find((r) => r.id === first)?.title).toBe("Renamed whole series");
      expect(rows.find((r) => r.id === second)?.title).toBe("Renamed whole series");
      expect(rows.find((r) => r.id === third)?.title).toBe("Renamed whole series");
    });

    it("a dateTime change only ever moves the single occurrence being edited, even with editScope series", async () => {
      const { first, second } = insertSeries();
      await callPatch(patchReq("dad", { dateTime: "2026-01-02T09:00:00", editScope: "series" }), idParams(first));

      const rows = getDb().prepare(`SELECT id, date_time FROM events`).all() as { id: string; date_time: string }[];
      expect(rows.find((r) => r.id === first)?.date_time).toBe("2026-01-02T09:00:00");
      expect(rows.find((r) => r.id === second)?.date_time).toBe("2026-01-08T09:00:00");
    });
  });
});

describe("DELETE /api/calendar/[id]", () => {
  it("requires authentication", async () => {
    const id = insertEvent();
    const res = await callDelete(deleteReq(null), idParams(id));
    expect(res.status).toBe(401);
  });

  it("forbids a non-creator, non-admin from deleting", async () => {
    const id = insertEvent({ created_by: "dad" });
    const res = await callDelete(deleteReq("malachi"), idParams(id));
    expect(res.status).toBe(403);
  });

  it('scope "this" (default) deletes only the target occurrence', async () => {
    const recurrenceId = randomUUID();
    const first = insertEvent({ recurrence_id: recurrenceId, recurrence_frequency: "weekly", date_time: "2026-01-01T09:00:00" });
    const second = insertEvent({ recurrence_id: recurrenceId, recurrence_frequency: "weekly", date_time: "2026-01-08T09:00:00" });

    const res = await callDelete(deleteReq("dad"), idParams(first));
    expect(res.status).toBe(204);

    const remaining = getDb().prepare(`SELECT id FROM events`).all() as { id: string }[];
    expect(remaining.map((r) => r.id)).toEqual([second]);
  });

  it('scope "future" deletes the target and every later occurrence, and truncates recurrence_until on what remains', async () => {
    const recurrenceId = randomUUID();
    const first = insertEvent({ recurrence_id: recurrenceId, recurrence_frequency: "weekly", date_time: "2026-01-01T09:00:00" });
    const second = insertEvent({ recurrence_id: recurrenceId, recurrence_frequency: "weekly", date_time: "2026-01-08T09:00:00" });
    const third = insertEvent({ recurrence_id: recurrenceId, recurrence_frequency: "weekly", date_time: "2026-01-15T09:00:00" });

    const res = await callDelete(deleteReq("dad", "future"), idParams(second));
    expect(res.status).toBe(204);

    const remaining = getDb().prepare(`SELECT id, recurrence_until FROM events`).all() as {
      id: string;
      recurrence_until: string | null;
    }[];
    expect(remaining.map((r) => r.id)).toEqual([first]);
    expect(remaining[0]!.recurrence_until).toBe("2026-01-08T09:00:00");
    void third;
  });

  it('scope "series" deletes every occurrence in the series', async () => {
    const recurrenceId = randomUUID();
    insertEvent({ recurrence_id: recurrenceId, recurrence_frequency: "weekly", date_time: "2026-01-01T09:00:00" });
    const second = insertEvent({ recurrence_id: recurrenceId, recurrence_frequency: "weekly", date_time: "2026-01-08T09:00:00" });

    const res = await callDelete(deleteReq("dad", "series"), idParams(second));
    expect(res.status).toBe(204);

    expect(getDb().prepare(`SELECT COUNT(*) as n FROM events`).get()).toEqual({ n: 0 });
  });

  it("also removes event_assignments for deleted occurrences", async () => {
    const id = insertEvent();
    getDb().prepare(`INSERT INTO event_assignments (event_id, user_id) VALUES (?, ?)`).run(id, "dad");

    await callDelete(deleteReq("dad"), idParams(id));

    expect(getDb().prepare(`SELECT COUNT(*) as n FROM event_assignments`).get()).toEqual({ n: 0 });
  });
});
