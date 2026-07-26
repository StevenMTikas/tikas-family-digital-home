"use client";

// Client half of the Dashboard/Morning Briefing screen. See
// docs/02_Modules/Dashboard.md, docs/05_AI/Morning_Briefing.md: individual
// briefing by default, one-tap toggle to the family-wide view, weather
// widget, quick-action shortcuts, and the same accept/dismiss/thumbs-down
// suggestion controls used in AI Settings' Suggestion History.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatEventTime } from "@/lib/calendar/dates";
import { getFamilyBriefing, DashboardApiError, type FamilyBriefing } from "@/lib/api/dashboard";
import { acceptSuggestion, giveSuggestionFeedback, AiSettingsApiError } from "@/lib/api/ai-settings";
import type { WeatherSnapshot } from "@/lib/weather";

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
}

const QUICK_ACTIONS: { label: string; icon: string; action: (router: ReturnType<typeof useRouter>) => void }[] = [
  { label: "Add Event", icon: "📅", action: (router) => router.push("/calendar") },
  { label: "Add Task", icon: "✅", action: (router) => router.push("/tasks") },
  { label: "Assistant", icon: "💬", action: () => window.dispatchEvent(new CustomEvent("tikas:open-assistant")) },
  { label: "Documents", icon: "📄", action: (router) => router.push("/content?tab=documents") },
  { label: "Search", icon: "🔍", action: (router) => router.push("/search") },
];

export default function DashboardPageClient({ fullName, todaysEvents, todaysTasks, suggestions, urgentFindings, weather }: Props) {
  const router = useRouter();
  const [scope, setScope] = useState<"mine" | "family">("mine");
  const [family, setFamily] = useState<FamilyBriefing | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);
  const [suggestionList, setSuggestionList] = useState(suggestions);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

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
  }

  async function handleSuggestionAction(id: string, action: "accept" | "thumbs_up" | "thumbs_down" | "dismissed") {
    setSuggestionError(null);
    try {
      if (action === "accept") await acceptSuggestion(id);
      else await giveSuggestionFeedback(id, action);
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
              {family && (
                <>
                  <Section title="Today's Events" first>
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
