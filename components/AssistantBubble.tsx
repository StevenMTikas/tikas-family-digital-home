"use client";

// Persistent Assistant chat bubble + docked panel, per Assistant.md:
// "available on every screen... Tapping it opens the Assistant without
// navigating away." Rendered from the root layout so it's truly global,
// since the shared sidebar/top-bar nav shell (Navigation.md) is Phase 7
// and doesn't exist yet — this is a self-contained global element that
// doesn't need that shell to satisfy "every screen."
//
// Recreated from the design handoff (Tikas Assistant.dc.html)'s dedicated-
// screen panel (history rail + active thread) — used as the one panel
// everywhere, satisfying both "bubble on every screen" and "history sidebar
// reachable from the same bubble/panel" in a single component.

import { useEffect, useRef, useState } from "react";
import {
  getConversations,
  createConversation,
  getConversation,
  sendMessageStreaming,
  AssistantApiError,
  type ConversationSummary,
  type ConversationMessage,
} from "@/lib/api/assistant";

export default function AssistantBubble() {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleOpen() {
    setOpen(true);
    if (loadedOnce) return;
    setLoadedOnce(true);
    try {
      const list = await getConversations();
      setConversations(list);
      if (list.length > 0) {
        await selectConversation(list[0]!.id);
      }
    } catch (err) {
      setError(err instanceof AssistantApiError ? err.message : "Couldn't load conversations.");
    }
  }

  async function selectConversation(id: string) {
    setError(null);
    setActiveId(id);
    try {
      const detail = await getConversation(id);
      setMessages(detail.messages);
    } catch (err) {
      setError(err instanceof AssistantApiError ? err.message : "Couldn't load that conversation.");
    }
  }

  async function handleNewConversation() {
    setError(null);
    try {
      const created = await createConversation();
      setConversations((prev) => [created, ...prev]);
      setActiveId(created.id);
      setMessages([]);
    } catch (err) {
      setError(err instanceof AssistantApiError ? err.message : "Couldn't start a new conversation.");
    }
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;

    let conversationId = activeId;
    if (!conversationId) {
      try {
        const created = await createConversation();
        setConversations((prev) => [created, ...prev]);
        conversationId = created.id;
        setActiveId(created.id);
      } catch (err) {
        setError(err instanceof AssistantApiError ? err.message : "Couldn't start a conversation.");
        return;
      }
    }

    setDraft("");
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString() },
      { id: `local-reply-${Date.now()}`, role: "assistant", content: "", createdAt: new Date().toISOString() },
    ]);

    try {
      await sendMessageStreaming(conversationId, text, (chunk) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + chunk };
          }
          return next;
        });
      });
      // Refresh the conversation list so a freshly auto-generated title shows up.
      getConversations().then(setConversations).catch(() => {});
    } catch (err) {
      setError(err instanceof AssistantApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Open Assistant"
          className="fixed bottom-7 right-7 w-[58px] h-[58px] rounded-full bg-accent shadow-[0_10px_28px_rgba(201,138,62,0.4)] flex items-center justify-center z-[60] text-white text-2xl"
        >
          💬
        </button>
      )}

      {open && (
        <div className="fixed top-0 right-0 bottom-0 w-[460px] bg-surface shadow-[-16px_0_40px_rgba(58,52,44,0.15)] flex z-50">
          <div className="w-[150px] shrink-0 border-r border-ink/[0.08] p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between px-1.5 pb-3.5">
              <div className="text-[11.5px] font-semibold text-ink-muted tracking-wide uppercase">History</div>
              <button type="button" onClick={handleNewConversation} aria-label="New conversation" className="text-accent">
                +
              </button>
            </div>
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectConversation(c.id)}
                className={`text-left px-2 py-2.5 rounded-[10px] ${c.id === activeId ? "bg-accent/[0.15]" : ""}`}
              >
                <div className={`text-xs font-semibold leading-tight ${c.id === activeId ? "text-ink" : "text-ink-muted"}`}>
                  {c.title ?? "New conversation"}
                </div>
                <div className="text-[10.5px] text-ink-muted mt-0.5">
                  {new Date(c.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </div>
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="h-16 shrink-0 flex items-center justify-between px-5 border-b border-ink/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-[30px] h-[30px] rounded-full bg-accent flex items-center justify-center text-white text-xs">💬</div>
                <div className="text-sm font-semibold text-ink">Assistant</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-ink-muted">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5">
              {messages.length === 0 && (
                <div className="text-[13.5px] text-ink-muted">
                  Hi! I&apos;m here whenever you need something — ask me anything.
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed ${
                      m.role === "user" ? "bg-trust text-white" : "bg-base text-ink"
                    }`}
                  >
                    {m.content || (sending && m.role === "assistant" ? "…" : "")}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {error && <p className="text-xs text-urgent px-5 pb-2">{error}</p>}

            <div className="shrink-0 p-4 border-t border-ink/[0.08] flex items-center gap-2.5">
              <input
                type="text"
                placeholder="Ask me anything…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSend();
                }}
                disabled={sending}
                className="flex-1 border border-ink/15 rounded-full px-4 py-2.5 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
                aria-label="Send"
                className="w-[38px] h-[38px] rounded-full bg-accent-strong text-white flex items-center justify-center shrink-0 disabled:opacity-60"
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
