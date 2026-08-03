"use client";

// Client half of the AI Settings screen. See docs/02_Modules/AI.md's Screen
// Layout: on/off toggle at top, then Conversation History / AI Memory /
// Suggestion History sections.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  setAiEnabled,
  flagAiMemoryEntry,
  editAiMemoryEntry,
  getAiMemoryFor,
  giveSuggestionFeedback,
  AiSettingsApiError,
  type AiMemoryEntry,
  type AiSuggestionEntry,
} from "@/lib/api/ai-settings";

export interface SuggestionData extends AiSuggestionEntry {}

export interface ViewableUser {
  id: string;
  fullName: string;
}

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
  myUserId,
  viewableUsers,
}: {
  initialAiEnabled: boolean;
  memories: AiMemoryEntry[];
  suggestions: SuggestionData[];
  isSuperAdmin: boolean;
  myUserId: string;
  viewableUsers: ViewableUser[];
}) {
  const router = useRouter();
  const [aiEnabled, setAiEnabledState] = useState(initialAiEnabled);
  const [error, setError] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState(myUserId);
  const [viewedMemories, setViewedMemories] = useState(memories);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

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

  async function loadMemoriesFor(userId: string) {
    setMemoriesLoading(true);
    setError(null);
    try {
      const result = await getAiMemoryFor(userId === myUserId ? undefined : userId);
      setViewedMemories(result);
    } catch (err) {
      setError(err instanceof AiSettingsApiError ? err.message : "Couldn't load that person's AI Memory.");
    } finally {
      setMemoriesLoading(false);
    }
  }

  async function handleViewingChange(userId: string) {
    setViewingUserId(userId);
    setEditingId(null);
    await loadMemoriesFor(userId);
  }

  async function handleFlag(id: string, currentlyFlagged: boolean) {
    setError(null);
    try {
      await flagAiMemoryEntry(id, !currentlyFlagged);
      if (viewingUserId === myUserId) router.refresh();
      await loadMemoriesFor(viewingUserId);
    } catch (err) {
      setError(err instanceof AiSettingsApiError ? err.message : "Something went wrong.");
    }
  }

  async function handleSaveEdit(id: string) {
    setError(null);
    try {
      await editAiMemoryEntry(id, editText);
      setEditingId(null);
      if (viewingUserId === myUserId) router.refresh();
      await loadMemoriesFor(viewingUserId);
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

  const grouped = viewedMemories.reduce<Record<string, AiMemoryEntry[]>>((acc, m) => {
    const key = m.category ?? "relationships_context";
    (acc[key] ??= []).push(m);
    return acc;
  }, {});
  const viewingSelf = viewingUserId === myUserId;

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
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="text-sm font-semibold text-ink">
            What the AI Knows {viewingSelf ? "About Me" : `About ${viewableUsers.find((u) => u.id === viewingUserId)?.fullName ?? ""}`}
          </div>
          {viewableUsers.length > 0 && (
            <select
              aria-label="Viewing whose AI Memory"
              value={viewingUserId}
              onChange={(e) => handleViewingChange(e.target.value)}
              className="text-[11px] text-ink-muted bg-base rounded-full px-2.5 py-1 border border-ink/10"
            >
              <option value={myUserId}>Myself</option>
              {viewableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
          )}
        </div>
        {viewingSelf && !isSuperAdmin && (
          <p className="text-xs text-ink-muted mb-3">
            You can flag anything that looks wrong — only the Super Admin can edit or remove entries.
          </p>
        )}
        {memoriesLoading ? (
          <p className="text-xs text-ink-muted">Loading…</p>
        ) : viewedMemories.length === 0 ? (
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
                    {editingId === m.id ? (
                      <>
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          autoFocus
                          className="flex-1 text-[13px] text-ink px-2 py-1 rounded-lg border border-ink/15 focus:outline-none focus:ring-2 focus:ring-accent/40"
                        />
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => handleSaveEdit(m.id)} className="text-[11px] font-semibold text-accent-strong">
                            Save
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-[11px] text-ink-muted">
                            Cancel
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-[13px] text-ink flex items-center gap-1.5">
                          {m.isSensitive && <span className="text-[10px]">🔒</span>}
                          {m.fact}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(m.id);
                                setEditText(m.fact);
                              }}
                              className="text-[11px] text-ink-muted underline"
                            >
                              Edit
                            </button>
                          )}
                          {viewingSelf && (
                            <button
                              type="button"
                              onClick={() => handleFlag(m.id, m.flagged)}
                              className={`text-[11px] px-2.5 py-1 rounded-full ${
                                m.flagged ? "text-urgent bg-urgent/[0.12]" : "text-ink-muted bg-base"
                              }`}
                            >
                              {m.flagged ? "Flagged" : "Flag"}
                            </button>
                          )}
                        </div>
                      </>
                    )}
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
                {s.relatedEntityTitle && (
                  <div className="text-[11px] font-semibold text-ink-muted mb-0.5">{s.relatedEntityTitle}</div>
                )}
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
