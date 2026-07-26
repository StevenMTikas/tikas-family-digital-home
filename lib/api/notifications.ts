// Thin typed API client for Notifications — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section.

export interface NotificationEntry {
  id: string;
  text: string;
  createdAt: string;
  severity: "routine" | "urgent";
  relatedSuggestionId: string | null;
  relatedEventId: string | null;
  relatedTaskId: string | null;
  liked: boolean | null;
}

export class NotificationsApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new NotificationsApiError(body?.error?.message ?? "Request failed.");
  }
  return res.json();
}

export async function getRecentNotifications(): Promise<NotificationEntry[]> {
  return unwrap(await fetch("/api/notifications"));
}

/** Where tapping a notification should navigate, per Notifications.md's tap-routing rule. */
export function routeForNotification(n: Pick<NotificationEntry, "relatedSuggestionId" | "relatedEventId" | "relatedTaskId">): string {
  if (n.relatedSuggestionId) return "/ai-settings";
  if (n.relatedEventId) return "/calendar";
  if (n.relatedTaskId) return "/tasks";
  return "/administration";
}
