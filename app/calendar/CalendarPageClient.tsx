"use client";

// Client half of the Calendar screen: weekly grid, event detail modal,
// add/edit form modal, week navigation. Recreated from the design handoff
// (Tikas Calendar.dc.html) — the shared sidebar/top-bar/Assistant chrome
// shown in that mockup isn't built yet (Navigation.md's shell is Phase 7),
// so this renders as a standalone page like the other module pages.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  CalendarApiError,
  type CalendarEvent,
  type EventInput,
} from "@/lib/api/calendar";
import {
  getWeekStart,
  getWeekDays,
  formatWeekLabel,
  toISODate,
  parseISODate,
  combineDateAndTime,
  splitDateTime,
  formatEventTime,
  formatFullDate,
} from "@/lib/calendar/dates";
import { FAMILY_EVENT_COLOR } from "@/lib/calendar/colors";

export interface CalendarEventData extends CalendarEvent {}

export interface FamilyMemberOption {
  id: string;
  fullName: string;
  calendarColor: string | null;
}

const REMINDER_OPTIONS = [
  "15 minutes before",
  "30 minutes before",
  "1 hour before",
  "1 day before",
  "2 days before",
  "5 days before",
  "7 days before",
];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function eventDisplay(event: CalendarEventData, membersById: Map<string, FamilyMemberOption>) {
  if (event.assigneeIds.length === 1) {
    const member = membersById.get(event.assigneeIds[0]!);
    const color = member?.calendarColor ?? FAMILY_EVENT_COLOR;
    return { color, personLabel: member?.fullName ?? "Unknown" };
  }
  return { color: FAMILY_EVENT_COLOR, personLabel: "Family" };
}

export default function CalendarPageClient({
  weekStartIso,
  events,
  familyMembers,
  currentUserId,
}: {
  weekStartIso: string;
  events: CalendarEventData[];
  familyMembers: FamilyMemberOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const weekStart = parseISODate(weekStartIso, new Date());
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStartIso]);
  const membersById = useMemo(() => new Map(familyMembers.map((m) => [m.id, m])), [familyMembers]);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);

  function goToWeek(newWeekStartIso: string) {
    router.push(`/calendar?week=${newWeekStartIso}`);
  }

  function shiftWeek(days: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + days);
    goToWeek(toISODate(getWeekStart(d)));
  }

  const eventsByDay: CalendarEventData[][] = weekDays.map((day) =>
    events
      .filter((e) => e.dateTime.startsWith(day.isoDate))
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  );

  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  return (
    <main className="p-6 max-w-[1000px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-medium">Calendar</h1>
          <p className="text-[12.5px] text-ink-muted mt-0.5">{formatWeekLabel(weekStart)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 mb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftWeek(-7)}
            className="w-[34px] h-[34px] rounded-[10px] bg-surface shadow-[0_4px_12px_rgba(58,52,44,0.05)] flex items-center justify-center"
            aria-label="Previous week"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => goToWeek(toISODate(getWeekStart(new Date())))}
            className="h-[34px] px-4 rounded-[10px] bg-surface shadow-[0_4px_12px_rgba(58,52,44,0.05)] text-[13px] font-semibold text-ink"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftWeek(7)}
            className="w-[34px] h-[34px] rounded-[10px] bg-surface shadow-[0_4px_12px_rgba(58,52,44,0.05)] flex items-center justify-center"
            aria-label="Next week"
          >
            ›
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 pr-1.5">
            {familyMembers
              .filter((m) => m.calendarColor)
              .map((m) => (
                <div key={m.id} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.calendarColor! }} />
                  <div className="text-[11.5px] text-ink-muted">{m.fullName}</div>
                </div>
              ))}
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: FAMILY_EVENT_COLOR }} />
              <div className="text-[11.5px] text-ink-muted">Family</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFormMode("create")}
            className="h-[34px] px-4.5 rounded-[10px] bg-accent-strong text-white text-[13px] font-semibold"
          >
            + Add Event
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {weekDays.map((day, i) => (
          <div
            key={day.isoDate}
            className="bg-surface rounded-2xl p-3 shadow-[0_8px_20px_rgba(58,52,44,0.05)] min-h-[280px]"
          >
            <div className="flex items-center gap-2 pb-2.5 mb-2 border-b border-ink/[0.07]">
              <div className="text-[10.5px] font-semibold tracking-wide text-ink-muted uppercase">
                {day.label}
              </div>
              <div
                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-xs font-semibold ${
                  day.isToday ? "bg-accent text-white" : "text-ink"
                }`}
              >
                {day.date}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {eventsByDay[i]!.length === 0 ? (
                <div className="text-[11.5px] text-ink-muted opacity-60 py-2 px-0.5">No events</div>
              ) : (
                eventsByDay[i]!.map((event) => {
                  const { color } = eventDisplay(event, membersById);
                  return (
                    <div
                      key={event.id}
                      onClick={() => setSelectedEventId(event.id)}
                      className="rounded-lg py-2 px-2.5 cursor-pointer"
                      style={{ backgroundColor: hexToRgba(color, 0.12), borderLeft: `3px solid ${color}` }}
                    >
                      <div className="flex items-center gap-1 text-[10.5px] text-ink-muted">
                        {event.visibility === "private" && <span>🔒</span>}
                        <span>{formatEventTime(event.dateTime)}</span>
                      </div>
                      <div className="text-[12.5px] font-semibold text-ink mt-0.5 leading-tight">
                        {event.title}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          display={eventDisplay(selectedEvent, membersById)}
          onClose={() => setSelectedEventId(null)}
          onEdit={() => {
            setFormMode("edit");
          }}
          onDeleted={() => {
            setSelectedEventId(null);
            router.refresh();
          }}
        />
      )}

      {formMode && (
        <EventFormModal
          mode={formMode}
          initial={formMode === "edit" ? selectedEvent : null}
          familyMembers={familyMembers}
          currentUserId={currentUserId}
          onClose={() => setFormMode(null)}
          onSaved={() => {
            setFormMode(null);
            setSelectedEventId(null);
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function EventDetailModal({
  event,
  display,
  onClose,
  onEdit,
  onDeleted,
}: {
  event: CalendarEventData;
  display: { color: string; personLabel: string };
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteEvent(event.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof CalendarApiError ? err.message : "Something went wrong. Try again.");
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-ink/[0.35] flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl p-8 w-[420px] shadow-[0_24px_60px_rgba(58,52,44,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: display.color }} />
          <div className="text-xs font-semibold text-ink-muted">{display.personLabel}</div>
        </div>
        <div className="font-display text-xl font-semibold text-ink mt-2.5">{event.title}</div>
        <div className="text-[13px] text-ink-muted mt-1.5">
          {formatFullDate(event.dateTime)} · {formatEventTime(event.dateTime)}
        </div>
        {event.description && (
          <div className="text-[13.5px] text-ink mt-4 leading-relaxed">{event.description}</div>
        )}
        <div className="flex items-center gap-2.5 mt-4.5">
          <div className="text-[11.5px] text-ink-muted bg-base px-2.5 py-1 rounded-full">
            {event.visibility === "private" ? "Private" : "Public"}
          </div>
          <div className="text-[11.5px] text-ink-muted bg-base px-2.5 py-1 rounded-full">
            Reminder: {event.reminderLeadTime ?? "None"}
          </div>
        </div>

        {error && <p className="text-xs text-urgent mt-3">{error}</p>}

        <div className="flex items-center justify-end gap-3 mt-6">
          {event.canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="text-[13px] font-semibold text-urgent disabled:opacity-60"
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">
            Close
          </button>
          {event.canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="text-[13px] font-semibold text-white bg-accent-strong px-4.5 py-2 rounded-full"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EventFormModal({
  mode,
  initial,
  familyMembers,
  currentUserId,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: CalendarEventData | null;
  familyMembers: FamilyMemberOption[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialSplit = initial ? splitDateTime(initial.dateTime) : null;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [date, setDate] = useState(initialSplit?.date ?? toISODate(new Date()));
  const [hour, setHour] = useState(initialSplit?.hour ?? "8");
  const [minute, setMinute] = useState(initialSplit?.minute ?? "00");
  const [ampm, setAmpm] = useState<"AM" | "PM">(initialSplit?.ampm ?? "AM");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(initial?.assigneeIds ?? [currentUserId]);
  const [visibility, setVisibility] = useState<"public" | "private">(initial?.visibility ?? "public");
  const [reminderLeadTime, setReminderLeadTime] = useState(initial?.reminderLeadTime ?? REMINDER_OPTIONS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  async function handleSave() {
    if (!title.trim() || assigneeIds.length === 0) {
      setError("Title and at least one assignee are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const input: EventInput = {
      title: title.trim(),
      description: description.trim() || null,
      dateTime: combineDateAndTime(date, hour, minute, ampm),
      visibility,
      reminderLeadTime,
      assigneeIds,
    };
    try {
      if (mode === "create") {
        await createEvent(input);
      } else if (initial) {
        await updateEvent(initial.id, input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof CalendarApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-ink/[0.35] flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl p-8 w-[440px] shadow-[0_24px_60px_rgba(58,52,44,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-lg font-semibold text-ink">
          {mode === "create" ? "Add Event" : "Edit Event"}
        </div>

        <div className="mt-5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Title</label>
            <input
              type="text"
              placeholder="e.g. Dentist appointment"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] font-body text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Description</label>
            <textarea
              placeholder="Add details…"
              rows={2}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-ink/15 text-[13.5px] font-body text-ink placeholder:text-ink-muted/70 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-ink mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-[10px] border border-ink/15 text-[13px] font-body text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-ink mb-1.5">Time</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={hour}
                  onChange={(e) => setHour(e.target.value.replace(/\D/g, ""))}
                  className="w-11 px-0 py-2 rounded-[10px] border border-ink/15 text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <span className="text-sm text-ink-muted font-semibold">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={minute}
                  onChange={(e) => setMinute(e.target.value.replace(/\D/g, ""))}
                  className="w-11 px-0 py-2 rounded-[10px] border border-ink/15 text-[13px] text-center focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <select
                  value={ampm}
                  onChange={(e) => setAmpm(e.target.value as "AM" | "PM")}
                  className="px-2 py-2 rounded-[10px] border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  <option>AM</option>
                  <option>PM</option>
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Assign to</label>
            <div className="flex gap-2 flex-wrap">
              {familyMembers.map((m) => {
                const active = assigneeIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleAssignee(m.id)}
                    className={`text-xs px-3 py-1.5 rounded-full ${
                      active ? "bg-accent-strong text-white" : "bg-base text-ink"
                    }`}
                  >
                    {m.fullName}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Visibility</label>
            <div className="flex rounded-[10px] overflow-hidden border border-ink/15 w-fit">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`px-4 py-1.5 text-xs font-semibold ${
                  visibility === "public" ? "bg-accent-strong text-white" : "bg-surface text-ink-muted"
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`px-4 py-1.5 text-xs font-semibold ${
                  visibility === "private" ? "bg-accent-strong text-white" : "bg-surface text-ink-muted"
                }`}
              >
                Private
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Reminder</label>
            <select
              value={reminderLeadTime ?? REMINDER_OPTIONS[0]}
              onChange={(e) => setReminderLeadTime(e.target.value)}
              className="w-full px-3 py-2 rounded-[10px] border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {REMINDER_OPTIONS.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-xs text-urgent mt-3">{error}</p>}

        <div className="flex items-center justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-[13px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full disabled:opacity-70"
          >
            {saving ? "Saving…" : "Save Event"}
          </button>
        </div>
      </div>
    </div>
  );
}
