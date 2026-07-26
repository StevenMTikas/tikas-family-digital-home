// Search — the shared service Search.md calls for, built so the dedicated
// search screen (app/search) and a future Assistant integration both call
// the same underlying logic (Application_Architecture.md's hybrid
// module + shared-core-service pattern, same relationship Assistant has to
// lib/core/ai). Covers Documents, Photos, Family_Knowledge_Item, and
// Password_Entry per Search.md's MVP scope.
//
// Vector index lives in the `vec_content` sqlite-vec virtual table
// (db/schema.sql), keyed by "<type>:<id>" — one shared table rather than
// four, since sqlite-vec's vec0 tables take a single primary key column and
// a household's total content volume is small enough that a combined
// nearest-neighbor scan costs nothing extra.

import { getDb } from "@/db/client";
import { canAccessFolder, canManageUser, type AuthUser } from "@/lib/core/permissions";
import { generateEmbedding } from "./embeddings";

export type SearchableType = "document" | "photo" | "family_knowledge" | "password";

export interface SearchResult {
  type: SearchableType;
  id: string;
  title: string;
  subtitle: string | null;
  isSensitive: boolean;
  distance: number;
}

function toBuffer(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}

function contentKey(type: SearchableType, id: string): string {
  return `${type}:${id}`;
}

function splitContentKey(key: string): { type: SearchableType; id: string } {
  const separator = key.indexOf(":");
  return { type: key.slice(0, separator) as SearchableType, id: key.slice(separator + 1) };
}

/** (Re-)indexes one content item — upserts via delete+insert, since vec0 doesn't support UPDATE. Call after create/edit. */
export async function indexContent(type: SearchableType, id: string, text: string): Promise<void> {
  const db = getDb();
  const key = contentKey(type, id);
  db.prepare(`DELETE FROM vec_content WHERE content_key = ?`).run(key);

  const trimmed = text.trim();
  if (!trimmed) return; // e.g. a photo uploaded with no tags/location yet — nothing meaningful to embed

  const embedding = await generateEmbedding(trimmed);
  db.prepare(`INSERT INTO vec_content (content_key, embedding) VALUES (?, ?)`).run(key, toBuffer(embedding));
}

/** Removes an item from the search index — call when the underlying content is deleted. */
export function removeFromIndex(type: SearchableType, id: string): void {
  getDb().prepare(`DELETE FROM vec_content WHERE content_key = ?`).run(contentKey(type, id));
}

interface DocumentRow {
  title: string;
  category: string | null;
  is_sensitive: number;
  folder_id: string | null;
}

interface PhotoRow {
  tags: string | null;
  location: string | null;
  is_sensitive: number;
  visibility: "public" | "private";
  uploaded_by: string;
}

interface KnowledgeRow {
  title: string;
  category: string | null;
  is_sensitive: number;
  folder_id: string | null;
}

interface PasswordRow {
  service_name: string;
  folder_id: string | null;
}

// Reuses each module's own view-permission rule verbatim (Documents/Family
// Knowledge/Password Entries: folder View access; Photos: public or
// canManageUser over the uploader) — Search.md: "results only ever include
// content the searching user already has permission to see."
async function loadIfVisible(type: SearchableType, id: string, actor: AuthUser, distance: number): Promise<SearchResult | null> {
  const db = getDb();
  const ctx = { userId: actor.id };

  if (type === "document") {
    const row = db.prepare(`SELECT title, category, is_sensitive, folder_id FROM documents WHERE id = ?`).get(id) as
      | DocumentRow
      | undefined;
    if (!row || !row.folder_id || !(await canAccessFolder(ctx, row.folder_id, "view"))) return null;
    return { type, id, title: row.title, subtitle: row.category, isSensitive: !!row.is_sensitive, distance };
  }

  if (type === "photo") {
    const row = db.prepare(`SELECT tags, location, is_sensitive, visibility, uploaded_by FROM photos WHERE id = ?`).get(id) as
      | PhotoRow
      | undefined;
    if (!row) return null;
    if (row.visibility !== "public" && !canManageUser(actor, row.uploaded_by)) return null;
    const tags: string[] = row.tags ? JSON.parse(row.tags) : [];
    return { type, id, title: tags.length > 0 ? tags.join(", ") : "Photo", subtitle: row.location, isSensitive: !!row.is_sensitive, distance };
  }

  if (type === "family_knowledge") {
    const row = db.prepare(`SELECT title, category, is_sensitive, folder_id FROM family_knowledge_items WHERE id = ?`).get(id) as
      | KnowledgeRow
      | undefined;
    if (!row || !row.folder_id || !(await canAccessFolder(ctx, row.folder_id, "view"))) return null;
    return { type, id, title: row.title, subtitle: row.category, isSensitive: !!row.is_sensitive, distance };
  }

  // password
  const row = db.prepare(`SELECT service_name, folder_id FROM password_entries WHERE id = ?`).get(id) as PasswordRow | undefined;
  if (!row || !row.folder_id || !(await canAccessFolder(ctx, row.folder_id, "view"))) return null;
  return { type, id, title: row.service_name, subtitle: null, isSensitive: true, distance };
}

// Over-fetch nearest neighbors before permission-filtering, since some of
// the closest matches may not be visible to this particular actor.
const CANDIDATE_MULTIPLIER = 6;

export async function searchContent(actor: AuthUser, query: string, limit = 20): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = getDb();
  const queryEmbedding = toBuffer(await generateEmbedding(trimmed));
  const k = limit * CANDIDATE_MULTIPLIER;

  const neighbors = db
    .prepare(`SELECT content_key, distance FROM vec_content WHERE embedding MATCH ? AND k = ? ORDER BY distance`)
    .all(queryEmbedding, k) as { content_key: string; distance: number }[];

  const results: SearchResult[] = [];
  for (const neighbor of neighbors) {
    if (results.length >= limit) break;
    const { type, id } = splitContentKey(neighbor.content_key);
    const result = await loadIfVisible(type, id, actor, neighbor.distance);
    if (result) results.push(result);
  }
  return results;
}
