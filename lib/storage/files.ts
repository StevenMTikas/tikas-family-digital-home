// Local file storage for Documents/Photos uploads — self-hosted on Dad's
// desktop per System_Overview.md, so "storage" is just the local disk, not
// a cloud bucket. Files are never served directly (no public/ path); every
// read goes through a route that checks folder/visibility permission first
// and streams the bytes, per Documents.md/Photos.md's View/Download rules.

import { randomUUID } from "crypto";
import { mkdir, unlink, readFile, writeFile } from "fs/promises";
import path from "path";

const UPLOADS_ROOT = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

export type UploadKind = "documents" | "photos";

/** Saves an uploaded file to local disk, returning the relative path stored in the DB. */
export async function saveUploadedFile(kind: UploadKind, file: File): Promise<string> {
  const dir = path.join(UPLOADS_ROOT, kind);
  await mkdir(dir, { recursive: true });

  const ext = path.extname(file.name);
  const filename = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return path.join(kind, filename);
}

export async function readUploadedFile(relativePath: string): Promise<Buffer> {
  return readFile(path.join(UPLOADS_ROOT, relativePath));
}

export async function deleteUploadedFile(relativePath: string): Promise<void> {
  try {
    await unlink(path.join(UPLOADS_ROOT, relativePath));
  } catch {
    // Best-effort — a missing file shouldn't block deleting the DB row.
  }
}
