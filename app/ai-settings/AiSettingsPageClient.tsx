"use client";

// Client half of the AI Settings screen. See docs/02_Modules/AI.md's Screen
// Layout: on/off toggle at top, then Conversation History / AI Memory /
// Suggestion History sections.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  setAiEnabled,
  flagAiMemoryEntry,
  giveSuggestionFeedback,
  AiSettingsApiError,
  type AiMemoryEntry,
  type AiSuggestionEntry,
} from "@/lib/api/ai-settings";

export interface SuggestionData extends AiSuggestionEntry {}

const CATEGORY_LABELS: Record<string, string> = {
  preferences: "Preferences",
  routines_patterns: "Routines & Patterns",
  relationships_context: "Relationships & Context",
};

export default function AiSettingsPageClient({
  initialAiEnabled,
  memories,
  suggestions,
  isSuperAdmin,
}: {
  initialAiEnabled: boolean;
  memories: AiMemoryEntry[];
  suggestions: SuggestionData[];
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [aiEnabled, setAiEnabledState] = useState(initialAiEnabled);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !aiEnabled;
    setAiEnabledState(next);
    setError(null);
    try {
      await setAiEnabled(next);
    } catch (err) {
      setAiEnabledState(!next);
      setError(err instanceof AiSettingsApiError ? err.message : "Something went wrong.");
    }
  }

  async function handleFlag(id: string, currentlyFlagged: boolean) {
    setError(null);
    try {
      await flagAiMemoryEntry(id, !currentlyFlagged);
      router.refresh();
    } catch (err) {
      setError(err instanceof AiSettingsApiError ? err.message : "Something went wrong.");
    }
  }

  async function handleFeedback(id: string, feedback: "thumbs_up" | "thumbs_down" | "dismissed") {
    setError(null);
    try {
      await giveSuggestionFeedback(id, feedback);
      router.refresh();
    } catch (err) {
      setError(err instanceof AiSettingsApiError ? err.message : "Something went wrong.");
    }
  }

  const grouped = memories.reduce<Record<string, AiMemoryEntry[]>>((acc, m) => {
    const key = m.category ?? "relationships_context";
    (acc[key] ??= []).push(m);
    return acc;
  }, {});

  return (
    <main className="p-6 max-w-[720px]">
      <h1 className="font-display text-2xl font-medium">AI Settings</h1>

      {error && <p className="text-xs text-urgent mt-3">{error}</p>}

      <div className="bg-surface rounded-2xl p-6 shadow-[0_8px_20px_rgba(58,52,44,0.05)] mt-6 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-ink">AI features</div>
          <div className="text-xs text-ink-muted mt-0.5">
            {aiEnabled
              ? "The Assistant and suggestions are on for your account."
              : "Turned off — the Assistant won't respond and no new suggestions will be generated for you."}
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          aria-label="Toggle AI features"
          className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${aiEnabled ? "bg-accent-strong justify-end" : "bg-ink/20 justify-start"}`}
        >
          <span className="w-5 h-5 rounded-full bg-white block" />
        </button>
      </div>

      <div className="bg-surface rounded-2xl p-6 shadow-[0_8px_20px_rgba(58,52,44,0.05)] mt-5">
        <div className="text-sm font-semibold text-ink">Conversation History</div>
        <p className="text-xs text-ink-muted mt-1.5">
          Open the Assistant bubble in the bottom-right corner of any screen to see and continue past conversations.
        </p>
      </div>

      <div className="bg-surface rounded-2xl p-6 shadow-[0_8px_20px_rgba(58,52,44,0.05)] mt-5">
        <div className="text-sm font-semibold text-ink mb-1">What the AI Knows About Me</div>
        {!isSuperAdmin && (
          <p className="text-xs text-ink-muted mb-3">
            You can flag anything that looks wrong — only the Super Admin can edit or remove entries.
          </p>
        )}
        {memories.length === 0 ? (
          <p className="text-xs text-ink-muted">Nothing stored yet.</p>
        ) : (
          Object.entries(grouped).map(([category, entries]) => (
            <div key={category} className="mt-4 first:mt-0">
              <div className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase mb-2">
                {CATEGORY_LABELS[category] ?? category}
              </div>
              <div className="flex flex-col gap-2">
                {entries.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-2 border-t border-ink/[0.07] first:border-t-0">
                    <div className="text-[13px] text-ink flex items-center gap-1.5">
                      {m.isSensitive && <span className="text-[10px]">🔒</span>}
                      {m.fact}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFlag(m.id, m.flagged)}
                      className={`text-[11px] shrink-0 px-2.5 py-1 rounded-full ${
                        m.flagged ? "text-urgent bg-urgent/[0.12]" : "text-ink-muted bg-base"
                      }`}
                    >
                      {m.flagged ? "Flagged" : "Flag"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-surface rounded-2xl p-6 shadow-[0_8px_20px_rgba(58,52,44,0.05)] mt-5 mb-8">
        <div className="text-sm font-semibold text-ink mb-3">Suggestion History</div>
        {suggestions.length === 0 ? (
          <p className="text-xs text-ink-muted">No suggestions yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {suggestions.map((s) => (
              <div key={s.id} className="py-2.5 border-t border-ink/[0.07] first:border-t-0">
                <div className="text-[13px] text-ink">{s.content}</div>
                <div className="flex items-center justify-between mt-1.5">
                  <div className="text-[11px] text-ink-muted">
                    {s.module ?? "general"} ·{" "}
                    {s.expired
                      ? `expired (${s.expiredReason ?? "no longer relevant"})`
                      : s.feedback !== "none"
                        ? s.feedback.replace("_", " ")
                        : s.acceptedAt
                          ? "accepted"
                          : "active"}
                  </div>
                  {!s.expired && s.feedback === "none" && !s.acceptedAt && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleFeedback(s.id, "thumbs_up")}
                        aria-label="Helpful suggestion"
                        className="text-xs"
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(s.id, "thumbs_down")}
                        aria-label="Not a helpful suggestion"
                        className="text-xs"
                      >
                        👎
                      </button>
                      <button type="button" onClick={() => handleFeedback(s.id, "dismissed")} className="text-[11px] text-ink-muted">
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
