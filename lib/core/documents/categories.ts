// Keeps document_categories (the manageable list) in sync with whatever
// free-text value actually lands in documents.category — see schema.sql's
// comment on document_categories for why the two are separate.

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";

export function ensureCategoryExists(name: string, createdBy: string): void {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM document_categories WHERE name = ?`).get(name);
  if (existing) return;
  db.prepare(`INSERT INTO document_categories (id, name, created_by) VALUES (?, ?, ?)`).run(randomUUID(), name, createdBy);
}
