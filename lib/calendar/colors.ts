// Per-person calendar color assignment. See Calendar.md: "Dad — blue, Vee —
// purple, Malachi — red... New family members added later are assigned a
// color automatically from an expanding palette." The first three are set
// explicitly in db/seed.js to match that fixed initial mapping; this palette
// (and its ordering) is what any Add User call after that draws from.

import type Database from "better-sqlite3";

export const CALENDAR_COLOR_PALETTE = [
  "#3F6FA0", // Dad — blue
  "#7A5C99", // Vee — purple
  "#BE5A4E", // Malachi — red
  "#5C8B6E", // forest green
  "#B08B3F", // ochre
  "#5C7A99", // steel blue
  "#8C5C7A", // mauve
];

// Distinct from any person's individual color — used for an event assigned
// to more than one family member, per the design's "Family" legend entry.
// Reuses the existing `accent` design token rather than introducing a new one.
export const FAMILY_EVENT_COLOR = "#C98A3E";

/** Picks the first palette color not already assigned to an existing user. */
export function assignNextCalendarColor(db: Database.Database): string {
  const used = new Set(
    (db.prepare(`SELECT calendar_color FROM users WHERE calendar_color IS NOT NULL`).all() as {
      calendar_color: string;
    }[]).map((row) => row.calendar_color)
  );

  const next = CALENDAR_COLOR_PALETTE.find((color) => !used.has(color));
  return next ?? CALENDAR_COLOR_PALETTE[used.size % CALENDAR_COLOR_PALETTE.length]!;
}
