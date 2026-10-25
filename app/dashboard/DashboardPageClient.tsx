"use client";

// Client half of the Dashboard/Morning Briefing screen. See
// docs/02_Modules/Dashboard.md, docs/05_AI/Morning_Briefing.md: individual
// briefing by default, one-tap toggle to the family-wide view, weather
// widget, quick-action shortcuts, and the same accept/dismiss/thumbs-down
// suggestion controls used in AI Settings' Suggestion History.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEventTime } from "@/lib/calendar/dates";
import { getPushSubscriptionStatus, subscribeToPush, PushApiError } from "@/lib/api/push";
import {
  getFamilyBriefing,
  getFamilyMessages,
  postFamilyMessage,
  editFamilyMessage,
  deleteFamilyMessage,
  DashboardApiError,
  type FamilyBriefing,
  type FamilyMessage,
} from "@/lib/api/dashboard";
import { acceptSuggestion, giveSuggestionFeedback, AiSettingsApiError } from "@/lib/api/ai-settings";
import type { WeatherSnapshot } from "@/lib/weather";
import type { Role } from "@/lib/core/permissions/types";

export interface TodayEvent {
  id: string;
  title: string;
  dateTime: string;
}

export interface TodayTask {
  id: string;
  title: string;
  status: "not_done" | "done";
}

export interface SuggestionData {
  id: string;
  module: string | null;
  content: string;
  relatedEntityId: string | null;
  suggestedValue: string | null;
  relatedEntityTitle: string | null;
}

export interface UrgentFinding {
  id: string;
  text: string;
  createdAt: string;
}

interface Props {
  fullName: string;
  todaysEvents: TodayEvent[];
  todaysTasks: TodayTask[];
  suggestions: SuggestionData[];
  urgentFindings: UrgentFinding[];
  weather: WeatherSnapshot | null;
  currentUserId: string;
  currentUserRole: Role;
}

const QUICK_ACTIONS: { label: string; icon: string; action: (router: ReturnType<typeof useRouter>) => void }[] = [
  { label: "Add Event", icon: "📅", action: (router) => router.push("/calendar") },
  { label: "Add Task", icon: "✅", action: (router) => router.push("/tasks") },
  { label: "Assistant", icon: "💬", action: () => window.dispatchEvent(new CustomEvent("tikas:open-assistant")) },
  { label: "Documents", icon: "📄", action: (router) => router.push("/content?tab=documents") },
  { label: "Search", icon: "🔍", action: (router) => router.push("/search") },
];

// One-time nudge toward real device notifications (My Devices/Users has the
// permanent control) — only for a browser that's supported and not already
// subscribed/denied, and only until dismissed once (tracked per-browser via
// localStorage, same "per-device" reasoning as the subscription itself).
const PUSH_NUDGE_DISMISSED_KEY = "tikas:push-nudge-dismissed";

function PushNudgeBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem(PUSH_NUDGE_DISMISSED_KEY)) return;
    getPushSubscriptionStatus()
      .then((status) => setVisible(status === "not-subscribed"))
      .catch(() => {});
  }, []);

  function dismiss() {
    localStorage.setItem(PUSH_NUDGE_DISMISSED_KEY, "1");
    setVisible(false);
  }

  async function handleEnable() {
    setError(null);
    setBusy(true);
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setError("Push isn't configured on this server yet.");
      setBusy(false);
      return;
    }
    try {
      await subscribeToPush(vapidPublicKey);
      dismiss();
    } catch (err) {
      setError(err instanceof PushApiError ? err.message : "Couldn't enable notifications.");
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="mt-4 bg-surface rounded-2xl p-4 shadow-[0_8px_20px_rgba(58,52,44,0.05)] flex items-center justify-between gap-4">
      <p className="text-[12.5px] text-ink">
        Want real notifications from this device (a Windows notification here, or your phone's normal notifications)? You
        can turn this on any time in My Devices.
      </p>
      <div className="flex items-center gap-3 shrink-0">
        {error && <p className="text-[11px] text-urgent">{error}</p>}
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy}
          className="text-[12.5px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full disabled:opacity-70"
        >
          {busy ? "Enabling…" : "Enable"}
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-ink-muted">
          ✕
        </button>
      </div>
    </div>
  );
}

export default function DashboardPageClient({
  fullName,
  todaysEvents,
  todaysTasks,
  suggestions,
  urgentFindings,
  weather,
  currentUserId,
  currentUserRole,
}: Props) {
  const router = useRouter();
  const [scope, setScope] = useState<"mine" | "family">("mine");
  const [family, setFamily] = useState<FamilyBriefing | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);
  const [suggestionList, setSuggestionList] = useState(suggestions);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  // Family Message Board (Dashboard.md) — fetched alongside the family
  // briefing, only ever shown in the "family" scope.
  const [messages, setMessages] = useState<FamilyMessage[] | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [newMessageText, setNewMessageText] = useState("");
  const [postingMessage, setPostingMessage] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editMessageText, setEditMessageText] = useState("");
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  // Allow-list, not a `!== "basic_user"` deny-list — mirrors the server-side
  // check in app/api/dashboard/messages/route.ts, which a deny-list shape
  // would silently misfire for a role like external_viewer.
  const canPostMessages = currentUserRole === "admin" || currentUserRole === "super_admin";

  function handleScopeChange(next: "mine" | "family") {
    setScope(next);
    if (next === "family" && !family) {
      setFamilyLoading(true);
      setFamilyError(null);
      getFamilyBriefing()
        .then(setFamily)
        .catch((err) => setFamilyError(err instanceof DashboardApiError ? err.message : "Couldn't load the family view."))
        .finally(() => setFamilyLoading(false));
    }
    if (next === "family" && !messages) {
      getFamilyMessages()
        .then(setMessages)
        .catch((err) => setMessagesError(err instanceof DashboardApiError ? err.message : "Couldn't load the message board."));
    }
  }

  async function handlePostMessage() {
    if (!newMessageText.trim()) return;
    setPostingMessage(true);
    setMessagesError(null);
    try {
      const posted = await postFamilyMessage(newMessageText.trim());
      setMessages((prev) => [posted, ...(prev ?? [])]);
      setNewMessageText("");
    } catch (err) {
      setMessagesError(err instanceof DashboardApiError ? err.message : "Something went wrong.");
    } finally {
      setPostingMessage(false);
    }
  }

  async function handleSaveEditedMessage(id: string) {
    if (!editMessageText.trim()) return;
    setBusyMessageId(id);
    setMessagesError(null);
    try {
      const updated = await editFamilyMessage(id, editMessageText.trim());
      setMessages((prev) => (prev ?? []).map((m) => (m.id === id ? updated : m)));
      setEditingMessageId(null);
    } catch (err) {
      setMessagesError(err instanceof DashboardApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyMessageId(null);
    }
  }

  async function handleDeleteMessage(id: string) {
    if (!confirm("Delete this message?")) return;
    setBusyMessageId(id);
    setMessagesError(null);
    try {
      await deleteFamilyMessage(id);
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== id));
    } catch (err) {
      setMessagesError(err instanceof DashboardApiError ? err.message : "Something went wrong.");
    } finally {
      setBusyMessageId(null);
    }
  }

  async function handleSuggestionAction(id: string, action: "accept" | "thumbs_up" | "thumbs_down" | "dismissed") {
    setSuggestionError(null);
    try {
      if (action === "accept") {
        // The response's suggestedValue may be freshly backfilled by the
        // API (for a suggestion generated before Advisor started capturing
        // one) — use that rather than the possibly-stale value already in
        // local state. Per AI_Suggestions.md: Accept navigates to the
        // relevant screen with the suggestion pre-filled — the user still
        // reviews and saves, rather than the AI silently applying it. Only
        // documents have a structured suggested value today; other
        // suggestion types just clear from the list like before.
        const accepted = await acceptSuggestion(id);
        if (accepted.module === "documents" && accepted.relatedEntityId) {
          const params = new URLSearchParams({ tab: "documents", edit: accepted.relatedEntityId });
          if (accepted.suggestedValue) params.set("suggestedCategory", accepted.suggestedValue);
          router.push(`/content?${params.toString()}`);
          return;
        }
      } else {
        await giveSuggestionFeedback(id, action);
      }
      setSuggestionList((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setSuggestionError(err instanceof AiSettingsApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <main className="relative p-6 max-w-[720px] md:max-w-[900px] animate-settle-in">
      {/* Design_Language.md's signature "warm glow" — used once per screen at
          most, behind the single most important element. Same radial-amber
          recipe as the Login screen's logo glow (app/login/page.tsx). */}
      <div
        className="absolute -z-10 -top-10 -left-10 w-[280px] h-[280px] rounded-full pointer-events-none bg-[radial-gradient(circle,rgba(201,138,62,0.24)_0%,rgba(201,138,62,0)_70%)]"
        aria-hidden="true"
      />

      <div className="relative flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium">
          {scope === "mine" ? `Good morning, ${fullName.split(" ")[0]}` : "The Whole Family"}
        </h1>
        <div className="flex bg-base rounded-full p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => handleScopeChange("mine")}
            className={`px-3 py-1.5 rounded-full ${scope === "mine" ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
          >
            My Day
          </button>
          <button
            type="button"
            onClick={() => handleScopeChange("family")}
            className={`px-3 py-1.5 rounded-full ${scope === "family" ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
          >
            Whole Family
          </button>
        </div>
      </div>

      {urgentFindings.length > 0 && scope === "mine" && (
        <div className="mt-4 flex flex-col gap-2">
          {urgentFindings.map((f) => (
            <div key={f.id} className="bg-urgent/[0.08] border border-urgent/20 rounded-2xl p-4 text-[13px] text-urgent font-medium">
              {f.text}
            </div>
          ))}
        </div>
      )}

      {scope === "mine" && <PushNudgeBanner />}

      {/*
        Dashboard_Layout.md's section order (mobile, top-to-bottom): Weather →
        Morning Briefing content → Suggestions → Quick-action shortcuts. DOM
        order below matches that exactly, so it "just works" as a single
        column on mobile with no responsive classes needed. Desktop keeps the
        same DOM/reading order but repaints it into a 2-column grid via
        md:col-start/md:row-start — Briefing becomes the large left column,
        Weather/Suggestions/Quick Actions form a narrower column alongside it,
        per Dashboard_Layout.md's desktop adaptation ("same content, same
        relative priority, different use of available width").
      */}
      <div className="md:grid md:grid-cols-[1fr_300px] md:gap-6 md:items-start mt-5">
        {weather && (
          <div className="md:col-start-2 md:row-start-1 bg-surface rounded-2xl px-4 py-3 shadow-[0_8px_20px_rgba(58,52,44,0.05)] text-[13px] text-ink-muted">
            {weather.temperatureF}°F, {weather.condition}
          </div>
        )}

        <div className="md:col-start-1 md:row-start-1 md:row-span-2 mt-5 md:mt-0">
          {scope === "mine" ? (
            <>
              <Section title="Today's Events" first>
                {todaysEvents.length === 0 ? (
                  <Empty text="Nothing on your calendar today." />
                ) : (
                  todaysEvents.map((e) => (
                    <Row key={e.id} onClick={() => router.push("/calendar")}>
                      <span className="text-[13px] text-ink">{e.title}</span>
                      <span className="text-xs text-ink-muted">{formatEventTime(e.dateTime)}</span>
                    </Row>
                  ))
                )}
              </Section>

              <Section title="Tasks Due Today">
                {todaysTasks.length === 0 ? (
                  <Empty text="No tasks due today." />
                ) : (
                  todaysTasks.map((t) => (
                    <Row key={t.id} onClick={() => router.push("/tasks")}>
                      <span className={`text-[13px] ${t.status === "done" ? "text-ink-muted line-through" : "text-ink"}`}>{t.title}</span>
                    </Row>
                  ))
                )}
              </Section>
            </>
          ) : (
            <>
              {familyLoading && <p className="text-sm text-ink-muted">Loading…</p>}
              {familyError && <p className="text-sm text-urgent">{familyError}</p>}
              <Section title="Family Message Board" first>
                {messagesError && <p className="text-xs text-urgent mb-2">{messagesError}</p>}
                {canPostMessages && (
                  <div className="flex items-start gap-2 mb-3">
                    <textarea
                      value={newMessageText}
                      onChange={(e) => setNewMessageText(e.target.value)}
                      placeholder="Post something for the whole family to see…"
                      rows={2}
                      className="flex-1 px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y min-h-[42px]"
                    />
                    <button
                      type="button"
                      onClick={handlePostMessage}
                      disabled={postingMessage || !newMessageText.trim()}
                      className="text-[13px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full disabled:opacity-60"
                    >
                      Post
                    </button>
                  </div>
                )}
                {messages === null ? (
                  <p className="text-xs text-ink-muted">Loading…</p>
                ) : messages.length === 0 ? (
                  <Empty text="No messages yet." />
                ) : (
                  messages.map((m, i) => {
                    const canEdit = m.postedBy === currentUserId;
                    const canDelete = canEdit || currentUserRole === "super_admin";
                    return (
                      <div key={m.id} className={`py-2.5 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
                        {editingMessageId === m.id ? (
                          <div className="flex items-start gap-2">
                            <textarea
                              value={editMessageText}
                              onChange={(e) => setEditMessageText(e.target.value)}
                              rows={2}
                              autoFocus
                              className="flex-1 px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y min-h-[42px]"
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={() => handleSaveEditedMessage(m.id)}
                                disabled={busyMessageId === m.id}
                                className="text-[11px] font-semibold text-accent-strong disabled:opacity-60"
                              >
                                Save
                              </button>
                              <button type="button" onClick={() => setEditingMessageId(null)} className="text-[11px] text-ink-muted">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-[13px] text-ink whitespace-pre-wrap">{m.text}</div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[11px] text-ink-muted">
                                {m.postedByName} · {formatMessageDate(m.createdAt)}
                                {m.updatedAt !== m.createdAt ? " (edited)" : ""}
                              </span>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMessageId(m.id);
                                    setEditMessageText(m.text);
                                    setMessagesError(null);
                                  }}
                                  className="text-[11px] text-ink-muted underline"
                                >
                                  Edit
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(m.id)}
                                  disabled={busyMessageId === m.id}
                                  className="text-[11px] text-urgent disabled:opacity-60"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </Section>

              {family && (
                <>
                  <Section title="Today's Events">
                    {family.events.length === 0 ? (
                      <Empty text="Nothing on the family calendar today." />
                    ) : (
                      family.events.map((e) => (
                        <Row key={e.id} onClick={() => router.push("/calendar")}>
                          <span className="text-[13px] text-ink">{e.title}</span>
                          <span className="text-xs text-ink-muted">
                            {formatEventTime(e.dateTime)}
                            {e.assigneeNames.length > 0 ? ` · ${e.assigneeNames.join(", ")}` : ""}
                          </span>
                        </Row>
                      ))
                    )}
                  </Section>

                  <Section title="Tasks Due Today">
                    {family.tasks.length === 0 ? (
                      <Empty text="No tasks due today." />
                    ) : (
                      family.tasks.map((t) => (
                        <Row key={t.id} onClick={() => router.push("/tasks")}>
                          <span className={`text-[13px] ${t.status === "done" ? "text-ink-muted line-through" : "text-ink"}`}>{t.title}</span>
                          <span className="text-xs text-ink-muted">{t.ownerName}</span>
                        </Row>
                      ))
                    )}
                  </Section>
                </>
              )}
            </>
          )}
        </div>

        {scope === "mine" && (
          <div className="md:col-start-2 md:row-start-2 mt-5 md:mt-0">
            <Section title="Suggestions" first>
              {suggestionError && <p className="text-xs text-urgent mb-2">{suggestionError}</p>}
              {suggestionList.length === 0 ? (
                <Empty text="No suggestions right now." />
              ) : (
                suggestionList.map((s) => (
                  <div key={s.id} className="py-2.5 border-t border-ink/[0.07] first:border-t-0">
                    {s.relatedEntityTitle && (
                      <div className="text-[11px] font-semibold text-ink-muted mb-0.5">{s.relatedEntityTitle}</div>
                    )}
                    <div className="text-[13px] text-ink">{s.content}</div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <button
                        type="button"
                        onClick={() => handleSuggestionAction(s.id, "accept")}
                        className="text-[11px] text-accent-strong font-medium"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSuggestionAction(s.id, "thumbs_up")}
                        aria-label="Helpful suggestion"
                        className="text-xs"
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSuggestionAction(s.id, "thumbs_down")}
                        aria-label="Not a helpful suggestion"
                        className="text-xs"
                      >
                        👎
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSuggestionAction(s.id, "dismissed")}
                        className="text-[11px] text-ink-muted"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))
              )}
            </Section>
          </div>
        )}

        <div className={`md:col-start-2 flex gap-2.5 mt-5 md:mt-0 overflow-x-auto md:flex-col md:overflow-visible ${scope === "mine" ? "md:row-start-3" : "md:row-start-2"}`}>
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.label}
              type="button"
              onClick={() => qa.action(router)}
              className="shrink-0 flex md:w-full flex-row md:flex-row items-center gap-2.5 md:gap-3 bg-surface rounded-2xl px-4 py-3 shadow-[0_8px_20px_rgba(58,52,44,0.05)]"
            >
              <span className="text-lg">{qa.icon}</span>
              <span className="text-[11px] text-ink-muted whitespace-nowrap">{qa.label}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

function Section({ title, children, first }: { title: string; children: React.ReactNode; first?: boolean }) {
  return (
    <div className={`bg-surface rounded-2xl p-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)] ${first ? "" : "mt-5"}`}>
      <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">{title}</div>
      {children}
    </div>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-between py-2 border-t border-ink/[0.07] first:border-t-0 text-left">
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-ink-muted">{text}</p>;
}

// created_at/updated_at come back as SQLite's "YYYY-MM-DD HH:MM:SS" (space,
// not "T"), unlike Event.dateTime — formatEventTime's "T"-split wouldn't work here.
function formatMessageDate(sqliteDateTime: string): string {
  const d = new Date(sqliteDateTime.replace(" ", "T"));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
