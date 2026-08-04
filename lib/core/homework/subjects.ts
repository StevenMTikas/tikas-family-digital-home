// Looks up or creates a Subject by name — used by the Tasks API when a
// homework Task's Subject field is set via free text (the Add/Edit Task
// form's "+ New subject" option), mirroring
// lib/core/documents/categories.ts's ensureCategoryExists. Unlike that
// helper, homework_details stores subject_id (an FK), not a name copy, so
// this returns the id rather than void — the caller needs it to write the
// Homework_Detail row.

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";

export function ensureSubjectExists(name: string, createdBy: string): string {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM subjects WHERE name = ?`).get(name) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = randomUUID();
  db.prepare(`INSERT INTO subjects (id, name, created_by) VALUES (?, ?, ?)`).run(id, name, createdBy);
  return id;
}
