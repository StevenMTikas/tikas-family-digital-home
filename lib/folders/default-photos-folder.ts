// Resolves the one folder every Photos upload is auto-filed into (2026-08),
// analogous to default-folder.ts's role for Documents/Family Knowledge —
// see db/schema.sql's folders.is_default_photos_folder comment for why this
// is a separate folder rather than reusing the "Whole Family" one.

import type Database from "better-sqlite3";

export function getDefaultPhotosFolderId(db: Database.Database): string | null {
  const row = db.prepare(`SELECT id FROM folders WHERE is_default_photos_folder = 1`).get() as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}
