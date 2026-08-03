// Pure date/time helpers for the weekly view (Calendar.md: "Weekly view for
// MVP... a 7-day grid"). Dates are treated as the household's local wall-clock
// time — no timezone handling, consistent with a single-household MVP.

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The Sunday that starts the week containing `date`. */
export function getWeekStart(date: Date): Date {
  const d = toDateOnly(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** "Week of July 19 – 25, 2026" — spans a month boundary as "July 28 – August 3, 2026". */
export function formatWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);

  const startMonth = MONTH_LABELS[weekStart.getMonth()]!;
  const endMonth = MONTH_LABELS[end.getMonth()]!;

  const range =
    startMonth === endMonth
      ? `${startMonth} ${weekStart.getDate()} – ${end.getDate()}`
      : `${startMonth} ${weekStart.getDate()} – ${endMonth} ${end.getDate()}`;

  return `Week of ${range}, ${end.getFullYear()}`;
}

/** YYYY-MM-DD, for the ?week= URL param and date-only comparisons. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parses a YYYY-MM-DD string as a local date; falls back to `fallback` if invalid. */
export function parseISODate(value: string | undefined, fallback: Date): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(y, m - 1, d);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export interface WeekDay {
  label: string;
  date: number;
  isoDate: string;
  isToday: boolean;
}

/** The 7 day-columns for the week starting at `weekStart`. */
export function getWeekDays(weekStart: Date, today: Date = new Date()): WeekDay[] {
  const todayIso = toISODate(toDateOnly(today));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const isoDate = toISODate(day);
    return { label: DAY_LABELS[i]!, date: day.getDate(), isoDate, isToday: isoDate === todayIso };
  });
}

/** Combines a date-picker value with the design's separate hour/minute/AM-PM fields into an ISO-ish local datetime string. */
export function combineDateAndTime(
  dateStr: string,
  hourStr: string,
  minuteStr: string,
  ampm: "AM" | "PM"
): string {
  let hour = parseInt(hourStr, 10) % 12;
  if (ampm === "PM") hour += 12;
  const minute = Math.min(59, Math.max(0, parseInt(minuteStr, 10) || 0));
  return `${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

export interface SplitDateTime {
  date: string;
  hour: string;
  minute: string;
  ampm: "AM" | "PM";
}

/** Inverse of combineDateAndTime — splits a stored datetime back into edit-form fields. */
export function splitDateTime(dateTimeIso: string): SplitDateTime {
  const [datePart, timePart] = dateTimeIso.split("T");
  const [hStr, mStr] = (timePart ?? "00:00:00").split(":");
  const h = Number(hStr ?? 0);
  const ampm: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { date: datePart ?? "", hour: String(hour12), minute: mStr ?? "00", ampm };
}

/** "8:30 AM" from an ISO-ish local datetime string. */
export function formatEventTime(dateTimeIso: string): string {
  const time = dateTimeIso.split("T")[1] ?? "00:00:00";
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "Mon, Jul 20" from an ISO-ish local datetime string. */
export function formatFullDate(dateTimeIso: string): string {
  const datePart = dateTimeIso.split("T")[0] ?? dateTimeIso;
  const [y, m, d] = datePart.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  const dayLabel = DAY_LABELS[date.getDay()]!;
  const monthLabel = MONTH_LABELS[date.getMonth()]!.slice(0, 3);
  return `${dayLabel}, ${monthLabel} ${d}`;
}

// ── Month + Day views (Calendar.md's "Day and month calendar views" Future
// Enhancement, built 2026-08-02) ────────────────────────────────────────

/** The 1st of the month containing `date`. */
export function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** The Sunday on/before the 1st of the month — where the month grid starts, so leading days from the prior month fill the first row. */
export function getMonthGridStart(date: Date): Date {
  return getWeekStart(getMonthStart(date));
}

/** "August 2026" */
export function formatMonthLabel(date: Date): string {
  return `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "Wednesday, August 2, 2026" — the Day view's header, spelled out (formatFullDate's "Mon, Jul 20" is the compact form used inside cards/modals). */
export function formatDayHeading(date: Date): string {
  const dayLabel = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()]!;
  return `${dayLabel}, ${MONTH_LABELS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

export interface MonthDay {
  date: number;
  isoDate: string;
  isToday: boolean;
  isCurrentMonth: boolean;
}

/**
 * A fixed 6-row (42-cell) grid starting from the Sunday on/before the 1st of
 * the month, through however far into the next month that spans — a stable,
 * predictable grid size rather than a dynamic 5-vs-6-row layout that would
 * shift the page height month to month.
 */
export function getMonthGridDays(date: Date, today: Date = new Date()): MonthDay[] {
  const gridStart = getMonthGridStart(date);
  const todayIso = toISODate(toDateOnly(today));
  const month = date.getMonth();
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(gridStart);
    day.setDate(day.getDate() + i);
    const isoDate = toISODate(day);
    return { date: day.getDate(), isoDate, isToday: isoDate === todayIso, isCurrentMonth: day.getMonth() === month };
  });
}
