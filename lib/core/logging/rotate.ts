// Size-based rotation for the flat log files (server.log, scheduler-*.log) the
// Windows Scheduled Tasks append to via shell redirection. Those files are
// held open by another process, so rotation here is copy-then-truncate rather
// than rename (a rename of an open file fails on Windows): the live file keeps
// its handle and simply starts empty again. A line written in the instant
// between the copy and the truncate can be lost — acceptable for diagnostics.
//
// Distinct from the 30-day security_events retention in ./index.ts, which
// governs the database table, not these files.

import fs from "fs";

export interface RotateOptions {
  maxBytes: number;
  /** How many rotated copies (file.1 … file.N) to keep. */
  keep: number;
}

/** Returns true if the file was rotated. A missing file is not an error. */
export function rotateLogIfLarge(file: string, { maxBytes, keep }: RotateOptions): boolean {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return false;
  }
  if (size <= maxBytes) return false;

  fs.rmSync(`${file}.${keep}`, { force: true });
  for (let i = keep - 1; i >= 1; i--) {
    if (fs.existsSync(`${file}.${i}`)) fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`);
  }
  fs.copyFileSync(file, `${file}.1`);
  fs.truncateSync(file, 0);
  return true;
}
