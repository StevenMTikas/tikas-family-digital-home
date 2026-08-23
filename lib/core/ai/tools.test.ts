process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { messageNeedsTools, getUserProfile } from "./tools";
import { createMemoryFact } from "./memory";

describe("messageNeedsTools", () => {
  it("returns false for a question unrelated to schedules or tasks", () => {
    expect(messageNeedsTools("give me the text of Amos 3:3")).toBe(false);
  });

  it("returns true for a question mentioning tasks", () => {
    expect(messageNeedsTools("What tasks do I have open?")).toBe(true);
  });

  it("returns true for a question mentioning the calendar/events", () => {
    expect(messageNeedsTools("Do I have any events this week?")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(messageNeedsTools("WHAT'S ON MY SCHEDULE TODAY")).toBe(true);
  });

  it("returns false for ordinary conversation", () => {
    expect(messageNeedsTools("Can you recommend a good pasta recipe?")).toBe(false);
  });

  it("returns true for a question about bills, even with no data model of its own", () => {
    // "bills" isn't a real entity (Tasks/Events cover it, e.g. "Pay
    // electricity bill") but it's real household vocabulary a user actually
    // asked (2026-08-23) — without this, the Assistant had no tool access
    // at all for the question and could only describe what it theoretically
    // could do, never actually check.
    expect(messageNeedsTools("Give me a list of all my bills for this month.")).toBe(true);
  });
});

describe("getUserProfile", () => {
  beforeAll(() => {
    const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
    const db = getDb();
    db.exec(schema);

    db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
      "dad",
      "dad.test",
      "Dad",
      "super_admin"
    );
    db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
      "malachi",
      "malachi.test",
      "Malachi",
      "basic_user"
    );
    db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
      "malcolm",
      "malcolm.test",
      "Malcolm",
      "basic_user"
    );
    db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
      "stranger",
      "stranger.test",
      "Stranger",
      "basic_user"
    );
    // Admin scoped to Malachi, individually granted View Child Activity Logs.
    db.prepare(
      `INSERT INTO users (id, username, password_hash, full_name, role, admin_scope, view_child_activity_logs) VALUES (?, ?, 'x', ?, ?, ?, 1)`
    ).run("vee", "vee.test", "Vee", "admin", JSON.stringify(["malachi"]));
    // Same scope, but never granted the permission.
    db.prepare(
      `INSERT INTO users (id, username, password_hash, full_name, role, admin_scope, view_child_activity_logs) VALUES (?, ?, 'x', ?, ?, ?, 0)`
    ).run("carol", "carol.test", "Carol", "admin", JSON.stringify(["malachi"]));

    return createMemoryFact({ userId: "malachi", fact: "Malachi has soccer practice Tuesdays.", source: "explicit_statement" });
  });

  it("lets a user view their own profile, including their own facts", async () => {
    const result = await getUserProfile("malachi", "Malachi");
    expect(result).toContain("Name: Malachi");
    expect(result).toContain("soccer practice Tuesdays");
  });

  it("denies an unrelated basic user viewing someone else's profile", async () => {
    const result = await getUserProfile("stranger", "Malachi");
    expect(result).toBe("You don't have permission to view Malachi's information.");
  });

  it("denies an admin scoped to the child but never granted View Child Activity Logs", async () => {
    const result = await getUserProfile("carol", "Malachi");
    expect(result).toBe("You don't have permission to view Malachi's information.");
  });

  it("allows an admin scoped to the child who holds View Child Activity Logs", async () => {
    const result = await getUserProfile("vee", "Malachi");
    expect(result).toContain("soccer practice Tuesdays");
  });

  it("allows the Super Admin to view anyone, permission or scope notwithstanding", async () => {
    const result = await getUserProfile("dad", "Malachi");
    expect(result).toContain("soccer practice Tuesdays");
  });

  it("reports no match for a name that doesn't exist", async () => {
    const result = await getUserProfile("dad", "Nobody");
    expect(result).toBe('No family member matching "Nobody" was found.');
  });

  it("asks for clarification when a name matches more than one person", async () => {
    const result = await getUserProfile("dad", "mal");
    expect(result).toContain("More than one family member matches");
    expect(result).toContain("Malachi");
    expect(result).toContain("Malcolm");
  });
});
