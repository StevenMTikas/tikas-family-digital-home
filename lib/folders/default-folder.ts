// Resolves the one folder every Documents/Family Knowledge upload currently
// targets. Folder_Management.md's browser/creation UI is Phase 4 and isn't
// built yet, so for MVP everything scopes to the built-in shared "Whole
// Family" folder seeded in db/seed.js — real per-folder selection lands
// once that admin screen exists.

import type Database from "better-sqlite3";

export function getDefaultFolderId(db: Database.Database): string | null {
  const row = db.prepare(`SELECT id FROM folders WHERE is_shared_family_folder = 1`).get() as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}
