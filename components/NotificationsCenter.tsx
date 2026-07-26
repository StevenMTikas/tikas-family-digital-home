"use client";

// Global notification bell + toast overlay, per Notifications.md: "one
// unified system, all sources" (reminders, Advisor suggestions, Guardian
// findings) with urgent items visually distinct and a capped last-10 list.
// Rendered from the root layout, same reasoning as AssistantBubble.tsx —
// there's no shared nav shell yet (Navigation.md is Phase 7), so this is a
// self-contained global element rather than living in a nav bar.
//
// Real-time delivery is an SSE connection to app/api/notifications/stream
// (backed by lib/core/notifications' in-process EventEmitter); the Recent
// Notifications list is seeded from GET /api/notifications on mount and then
// kept in sync from the same SSE messages, so it never needs to poll.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEscapeKey } from "@/lib/hooks/useEscapeKey";
import {
  getRecentNotifications,
  routeForNotification,
  type NotificationEntry,
} from "@/lib/api/notifications";
import { getPushSubscriptionStatus, subscribeToPush, unsubscribeFromPush, PushApiError } from "@/lib/api/push";

interface Toast extends NotificationEntry {
  toastId: string;
}

const RECENT_LIMIT = 10;
const ROUTINE_TOAST_MS = 6000;

export default function NotificationsCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  useEscapeKey(open, () => setOpen(false));
  const [recent, setRecent] = useState<NotificationEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pushStatus, setPushStatus] = useState<"unsupported" | "denied" | "subscribed" | "not-subscribed" | "checking">(
    "checking"
  );
  const [pushError, setPushError] = useState<string | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    getRecentNotifications()
      .then(setRecent)
      .catch(() => {});
    getPushSubscriptionStatus()
      .then(setPushStatus)
      .catch(() => setPushStatus("unsupported"));

    const source = new EventSource("/api/notifications/stream");
    source.onmessage = (event) => {
      const record: NotificationEntry = JSON.parse(event.data);
      setRecent((prev) => [record, ...prev].slice(0, RECENT_LIMIT));

      const toastId = `${record.id}-${Date.now()}`;
      setToasts((prev) => [...prev, { ...record, toastId }]);
      if (record.severity !== "urgent") {
        const timer = setTimeout(() => dismissToast(toastId), ROUTINE_TOAST_MS);
        timersRef.current.set(toastId, timer);
      }
    };

    return () => {
      source.close();
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismissToast(toastId: string) {
    const timer = timersRef.current.get(toastId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(toastId);
    }
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }

  function goTo(n: Pick<NotificationEntry, "relatedSuggestionId" | "relatedEventId" | "relatedTaskId">) {
    router.push(routeForNotification(n));
    setOpen(false);
  }

  async function handleEnablePush() {
    setPushError(null);
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setPushError("Push isn't configured on this server yet.");
      return;
    }
    try {
      await subscribeToPush(vapidPublicKey);
      setPushStatus("subscribed");
    } catch (err) {
      setPushError(err instanceof PushApiError ? err.message : "Couldn't enable push notifications.");
    }
  }

  async function handleDisablePush() {
    setPushError(null);
    try {
      await unsubscribeFromPush();
      setPushStatus("not-subscribed");
    } catch {
      setPushError("Couldn't disable push notifications.");
    }
  }

  return (
    <>
      {/* Sits left of NavShell's profile avatar in the same top bar row (Navigation.md) — not stacked on top of it. */}
      <div className="fixed top-2.5 right-16 z-[65]">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Notifications"
          className="w-11 h-11 rounded-full bg-surface shadow-[0_8px_20px_rgba(58,52,44,0.12)] flex items-center justify-center text-lg relative"
        >
          🔔
          {recent.length > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent-strong" />
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-[340px] max-h-[70vh] overflow-y-auto bg-surface rounded-2xl shadow-[0_16px_40px_rgba(58,52,44,0.18)] p-4">
            <div className="text-sm font-semibold text-ink mb-3">Notifications</div>

            {recent.length === 0 ? (
              <p className="text-xs text-ink-muted">Nothing yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {recent.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => goTo(n)}
                    className={`text-left px-2.5 py-2 rounded-xl border-l-2 ${
                      n.severity === "urgent" ? "border-urgent bg-urgent/[0.06]" : "border-transparent hover:bg-base"
                    }`}
                  >
                    <div className={`text-[13px] leading-snug ${n.severity === "urgent" ? "text-urgent font-medium" : "text-ink"}`}>
                      {n.text}
                    </div>
                    <div className="text-[10.5px] text-ink-muted mt-0.5">
                      {new Date(n.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-ink/[0.08] mt-3 pt-3">
              {pushStatus === "subscribed" && (
                <button type="button" onClick={handleDisablePush} className="text-[11.5px] text-ink-muted">
                  Push notifications on — turn off
                </button>
              )}
              {pushStatus === "not-subscribed" && (
                <button type="button" onClick={handleEnablePush} className="text-[11.5px] text-accent-strong font-medium">
                  Enable push notifications
                </button>
              )}
              {pushStatus === "denied" && (
                <p className="text-[11px] text-ink-muted">
                  Push notifications are blocked for this site in your browser settings.
                </p>
              )}
              {pushError && <p className="text-[11px] text-urgent mt-1">{pushError}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Below NavShell's top bar (h-14) rather than overlapping it. */}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 w-[92%] max-w-[420px]">
        {toasts.map((t) => (
          // Two independent sibling buttons, not a button-in-a-button — nesting
          // interactive elements is invalid HTML and leaves the dismiss control
          // unreachable on its own via keyboard (Accessibility.md).
          <div
            key={t.toastId}
            className={`px-4 py-3 rounded-2xl shadow-[0_10px_28px_rgba(58,52,44,0.18)] flex items-start justify-between gap-3 ${
              t.severity === "urgent" ? "bg-urgent text-white" : "bg-surface text-ink"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                dismissToast(t.toastId);
                goTo(t);
              }}
              className="text-left text-[13.5px] leading-snug flex-1"
            >
              {t.text}
            </button>
            <button
              type="button"
              onClick={() => dismissToast(t.toastId)}
              aria-label="Dismiss notification"
              className={`shrink-0 ${t.severity === "urgent" ? "text-white/80" : "text-ink-muted"}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
