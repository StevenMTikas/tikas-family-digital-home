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
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import {
  getConversations,
  createConversation,
  getConversation,
  sendMessageStreaming,
  giveMessageFeedback,
  previewEscalation,
  confirmEscalation,
  AssistantApiError,
  type ConversationSummary,
  type ConversationMessage,
  type EscalationPreview,
} from "@/lib/api/assistant";

// Speech-to-text: local Whisper via app/api/assistant/transcribe (Voice.md,
// Decision_Log.md). Replaces the earlier browser Web Speech API, which on
// Chrome/Android sent audio to Google's servers and wasn't actually
// on-device — see Future_Ideas.md's since-resolved local-Whisper entry.
// MediaRecorder captures the tap-to-talk audio; decoding/resampling happens
// client-side via the Web Audio API since Node has no AudioContext to decode
// compressed audio (webm/opus) itself — see the transcribe route's header
// comment for the full pipeline and the explicit little-endian wire format.

function isVoiceInputSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

// Matches app/api/assistant/transcribe/route.ts's decodePcmLE.
function encodePcmLE(pcm: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(pcm.length * 4);
  const view = new DataView(buffer);
  for (let i = 0; i < pcm.length; i++) view.setFloat32(i * 4, pcm[i] ?? 0, true);
  return buffer;
}

const TRANSCRIBE_SAMPLE_RATE = 16000;

// Decodes recorded audio (whatever codec MediaRecorder used, typically
// webm/opus) into mono PCM at the model's expected sample rate, entirely in
// the browser — decodeAudioData handles the codec, OfflineAudioContext
// handles the resample/downmix, so the server never needs an audio decoder.
async function decodeToPcm16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    audioCtx.close();
  }

  const frameCount = Math.max(1, Math.ceil(decoded.duration * TRANSCRIBE_SAMPLE_RATE));
  const offlineCtx = new OfflineAudioContext(1, frameCount, TRANSCRIBE_SAMPLE_RATE);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export default function AssistantBubble() {
  const [open, setOpen] = useState(false);
  useEscapeKey(open, () => setOpen(false));
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [canEscalate, setCanEscalate] = useState(false);
  // Which assistant message is currently showing an escalation preview, and its payload.
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [escalationPreview, setEscalationPreview] = useState<EscalationPreview | null>(null);
  const [escalationBusy, setEscalationBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastReplyRef = useRef("");
  const draftInputRef = useRef<HTMLTextAreaElement>(null);
  // Mirrors activeId for use inside async callbacks — state read in a
  // closure captures its value at call time, so a background fetch that
  // resolves after the user has switched conversations would otherwise
  // silently overwrite the now-different active conversation's messages
  // with stale data (the "my question disappeared" bug).
  const activeIdRef = useRef<string | null>(null);
  // Monotonic per-send counter. activeIdRef alone only catches a
  // *conversation switch* — it doesn't help when a second message is sent
  // in the *same* conversation before the first send's post-stream refresh
  // (below) has resolved, since activeIdRef.current still matches. Each
  // handleSend captures the counter's value at send time; a refresh only
  // applies if it's still the most recent send for this component.
  const sendSeqRef = useRef(0);

  function setActiveConversation(id: string | null) {
    activeIdRef.current = id;
    setActiveId(id);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow the textarea with content (up to the max-h set in its
  // className, after which it scrolls internally) — a plain <textarea>
  // doesn't do this on its own.
  useEffect(() => {
    const el = draftInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  // Dashboard.md's "Assistant" quick-action shortcut — there's no shared
  // layout state to reach this otherwise-self-contained global bubble
  // (Navigation.md's shell is Phase 7), so a plain window event is the
  // lightest bridge that doesn't require a new context provider.
  useEffect(() => {
    const openFromShortcut = () => handleOpen();
    window.addEventListener("tikas:open-assistant", openFromShortcut);
    return () => window.removeEventListener("tikas:open-assistant", openFromShortcut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function speak(text: string) {
    if (!isSpeechSynthesisSupported() || !text.trim()) return;
    window.speechSynthesis.cancel(); // Voice.md: a simple mute/replay control, not overlapping speech
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  async function handleMicToggle() {
    if (listening) {
      mediaRecorderRef.current?.stop(); // Voice.md: "stops immediately when the button is... tapped again" — rest of the pipeline runs in onstop below
      return;
    }

    if (!isVoiceInputSupported()) {
      setError("Voice input isn't supported in this browser.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Couldn't access the microphone — check permissions and try again.");
      return;
    }

    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop()); // release the mic indicator, tap-to-talk only, per Voice.md
      setListening(false);
      const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
      audioChunksRef.current = [];

      try {
        const pcm = await decodeToPcm16k(blob);
        const res = await fetch("/api/assistant/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: encodePcmLE(pcm),
        });
        if (!res.ok) throw new Error("Transcription request failed.");
        const { text } = await res.json();
        if (text) {
          handleSend(text);
        } else {
          setError("Couldn't hear that — try again.");
        }
      } catch {
        // No fallback to a cloud STT service here on purpose — that would
        // reintroduce the exact privacy gap local Whisper exists to close.
        setError("Couldn't hear that — try again.");
      }
    };

    mediaRecorderRef.current = recorder;
    setListening(true);
    setError(null);
    recorder.start();
  }

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
    setActiveConversation(id);
    setEscalatingId(null);
    setEscalationPreview(null);
    try {
      const detail = await getConversation(id);
      if (activeIdRef.current !== id) return; // switched to a different conversation while this was loading
      setMessages(detail.messages);
      setCanEscalate(detail.canEscalate);
    } catch (err) {
      if (activeIdRef.current !== id) return;
      setError(err instanceof AssistantApiError ? err.message : "Couldn't load that conversation.");
    }
  }

  async function handleFeedback(messageId: string, feedback: "thumbs_up" | "thumbs_down") {
    const conversationId = activeId;
    if (!conversationId) return;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
    try {
      await giveMessageFeedback(conversationId, messageId, feedback);
    } catch (err) {
      if (activeIdRef.current !== conversationId) return;
      setError(err instanceof AssistantApiError ? err.message : "Couldn't save feedback.");
      return;
    }

    // Thumbs-down escalation offer — only for local replies, and only when
    // the actor holds both permissions AI_Permissions.md requires (server
    // re-checks this too; canEscalate just controls whether we bother asking).
    const message = messages.find((m) => m.id === messageId);
    if (feedback === "thumbs_down" && canEscalate && message?.source === "local") {
      try {
        const preview = await previewEscalation(conversationId, messageId);
        if (activeIdRef.current !== conversationId) return; // switched away before the preview came back
        setEscalatingId(messageId);
        setEscalationPreview(preview);
      } catch (err) {
        if (activeIdRef.current !== conversationId) return;
        setError(err instanceof AssistantApiError ? err.message : "Couldn't prepare escalation preview.");
      }
    }
  }

  function cancelEscalation() {
    setEscalatingId(null);
    setEscalationPreview(null);
  }

  async function handleConfirmEscalation() {
    const conversationId = activeId;
    if (!conversationId || !escalatingId) return;
    setEscalationBusy(true);
    try {
      const reply = await confirmEscalation(conversationId, escalatingId);
      if (activeIdRef.current !== conversationId) return; // switched away before the escalation finished
      setMessages((prev) => [...prev, reply]);
      setEscalatingId(null);
      setEscalationPreview(null);
    } catch (err) {
      if (activeIdRef.current !== conversationId) return;
      setError(err instanceof AssistantApiError ? err.message : "Escalation failed.");
    } finally {
      setEscalationBusy(false);
    }
  }

  async function handleNewConversation() {
    setError(null);
    try {
      const created = await createConversation();
      setConversations((prev) => [created, ...prev]);
      setActiveConversation(created.id);
      setMessages([]);
    } catch (err) {
      setError(err instanceof AssistantApiError ? err.message : "Couldn't start a new conversation.");
    }
  }

  async function handleSend(overrideText?: string) {
    // Voice.md: transcribed tap-to-talk input "hands it to the Assistant
    // agent exactly as if it were typed" — same function, same path either way.
    const text = (overrideText ?? draft).trim();
    if (!text || sending) return;

    let conversationId = activeId;
    if (!conversationId) {
      try {
        const created = await createConversation();
        setConversations((prev) => [created, ...prev]);
        conversationId = created.id;
        setActiveConversation(created.id);
      } catch (err) {
        setError(err instanceof AssistantApiError ? err.message : "Couldn't start a conversation.");
        return;
      }
    }

    const mySeq = ++sendSeqRef.current;

    setDraft("");
    setError(null);
    setSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
        feedback: null,
        source: "local",
      },
      {
        id: `local-reply-${Date.now()}`,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        feedback: null,
        source: "local",
      },
    ]);

    let fullReply = "";
    try {
      await sendMessageStreaming(conversationId, text, (chunk) => {
        fullReply += chunk;
        // Guard against a reply chunk landing after the user has switched to
        // a different conversation — without this, the chunk would silently
        // get appended to whichever conversation happens to be showing now.
        if (activeIdRef.current !== conversationId) return;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + chunk };
          }
          return next;
        });
      });
      lastReplyRef.current = fullReply;
      if (speechEnabled) speak(fullReply);
      // Replace the optimistic temp-id messages with the persisted rows (real
      // ids + actual source) so feedback/escalate have something to target,
      // and refresh the list so a freshly auto-generated title shows up.
      // Guarded against both a conversation switch (activeIdRef) and a
      // newer send in this same conversation (sendSeqRef) landing first —
      // either one means this snapshot is stale and would silently
      // overwrite newer content (the "my question disappeared" bug).
      getConversations()
        .then((list) => {
          if (sendSeqRef.current !== mySeq) return;
          setConversations(list);
        })
        .catch(() => {});
      getConversation(conversationId)
        .then((detail) => {
          if (activeIdRef.current !== conversationId || sendSeqRef.current !== mySeq) return;
          setMessages(detail.messages);
          setCanEscalate(detail.canEscalate);
        })
        .catch(() => {});
    } catch (err) {
      if (activeIdRef.current === conversationId) {
        setError(err instanceof AssistantApiError ? err.message : "Something went wrong. Try again.");
      }
    } finally {
      // Global flag (only one send in flight at a time) — always reset
      // regardless of which conversation is active now, or the compose box
      // would stay disabled forever after switching away mid-send.
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
          // Raised above NavShell's mobile bottom tab bar (Navigation.md); desktop has no bottom bar, so it stays at bottom-7 there.
          className="fixed bottom-20 md:bottom-7 right-5 md:right-7 w-[58px] h-[58px] rounded-full bg-accent shadow-[0_10px_28px_rgba(201,138,62,0.4)] flex items-center justify-center z-[60] text-white text-2xl"
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
                className={`text-left px-2 py-2.5 rounded-xl ${c.id === activeId ? "bg-accent/[0.15]" : ""}`}
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
              <div className="flex items-center gap-3">
                {isSpeechSynthesisSupported() && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !speechEnabled;
                      setSpeechEnabled(next);
                      if (!next) window.speechSynthesis.cancel();
                    }}
                    aria-label={speechEnabled ? "Mute spoken replies" : "Speak replies aloud"}
                    title={speechEnabled ? "Mute spoken replies" : "Speak replies aloud"}
                    className="text-ink-muted text-sm"
                  >
                    {speechEnabled ? "🔊" : "🔇"}
                  </button>
                )}
                {isSpeechSynthesisSupported() && lastReplyRef.current && (
                  <button
                    type="button"
                    onClick={() => speak(lastReplyRef.current)}
                    aria-label="Replay last response"
                    title="Replay last response"
                    className="text-ink-muted text-sm"
                  >
                    🔁
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-ink-muted">
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5">
              {messages.length === 0 && (
                <div className="text-[13.5px] text-ink-muted">
                  Hi! I&apos;m here whenever you need something — ask me anything.
                </div>
              )}
              {messages.map((m) => {
                const isPersisted = !m.id.startsWith("local-");
                return (
                <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed ${
                      m.role === "user" ? "bg-trust text-white" : "bg-base text-ink"
                    }`}
                  >
                    {m.content || (sending && m.role === "assistant" ? "…" : "")}
                    {m.role === "assistant" && m.source === "frontier" && (
                      <div className="text-[10px] text-ink-muted mt-1">via Claude</div>
                    )}
                  </div>

                  {m.role === "assistant" && isPersisted && (
                    <div className="flex items-center gap-2 mt-1 px-1">
                      <button
                        type="button"
                        onClick={() => handleFeedback(m.id, "thumbs_up")}
                        aria-label="Good reply"
                        title="Good reply"
                        className={`text-xs ${m.feedback === "thumbs_up" ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFeedback(m.id, "thumbs_down")}
                        aria-label="Not helpful"
                        title="Not helpful"
                        className={`text-xs ${m.feedback === "thumbs_down" ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
                      >
                        👎
                      </button>
                    </div>
                  )}

                  {escalatingId === m.id && escalationPreview && (
                    <div className="max-w-[92%] mt-2 p-3 rounded-xl border border-accent/30 bg-accent/[0.06] text-[12px] text-ink">
                      <p className="font-semibold mb-1.5">Ask a frontier model (Claude) for a second opinion?</p>
                      <p className="text-ink-muted mb-1">This will send:</p>
                      <ul className="list-disc list-inside text-ink-muted mb-2 space-y-0.5">
                        <li>Your question: &quot;{escalationPreview.question}&quot;</li>
                        <li>The local reply you just rated down</li>
                        {escalationPreview.memoryFacts.length > 0 && (
                          <li>{escalationPreview.memoryFacts.length} fact{escalationPreview.memoryFacts.length === 1 ? "" : "s"} from what the Assistant knows about you</li>
                        )}
                      </ul>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleConfirmEscalation}
                          disabled={escalationBusy}
                          className="px-3 py-1.5 rounded-lg bg-accent-strong text-white text-xs disabled:opacity-60"
                        >
                          {escalationBusy ? "Asking…" : "Send it"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEscalation}
                          disabled={escalationBusy}
                          className="px-3 py-1.5 rounded-lg text-ink-muted text-xs disabled:opacity-60"
                        >
                          Never mind
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {error && <p className="text-xs text-urgent px-5 pb-2">{error}</p>}

            <div className="shrink-0 border-t border-ink/[0.08]">
              <p className="text-[10.5px] text-ink-muted px-4 pt-1.5">Shift+Enter for a new line</p>
              <div className="p-4 pt-1 flex items-end gap-2.5">
                <textarea
                  ref={draftInputRef}
                  rows={1}
                  placeholder="Ask me anything…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={sending}
                  className="flex-1 border border-ink/15 rounded-2xl px-4 py-2.5 text-[13.5px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none max-h-[120px] overflow-y-auto"
                />
                {isVoiceInputSupported() && (
                  <button
                    type="button"
                    onClick={handleMicToggle}
                    disabled={sending}
                    aria-label={listening ? "Stop listening" : "Speak to the Assistant"}
                    title={listening ? "Stop listening" : "Speak to the Assistant"}
                    className={`w-[38px] h-[38px] rounded-full flex items-center justify-center shrink-0 disabled:opacity-60 ${
                      listening ? "bg-urgent text-white animate-pulse" : "bg-base text-ink"
                    }`}
                  >
                    🎤
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={sending || !draft.trim()}
                  aria-label="Send"
                  className="w-[38px] h-[38px] rounded-full bg-accent-strong text-white flex items-center justify-center shrink-0 disabled:opacity-60"
                >
                  ➤
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
