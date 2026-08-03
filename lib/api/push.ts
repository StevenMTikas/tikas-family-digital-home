// Thin typed API client for Web Push subscription — Notifications.md's
// "Android push for MVP" — plus the browser-side subscribe/unsubscribe
// helpers that call the service worker's PushManager.

export class PushApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new PushApiError(body?.error?.message ?? "Request failed.");
  }
  return res.json();
}

function subscriptionToJson(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return { endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! } };
}

// PushManager wants the VAPID public key as a raw Uint8Array, not the
// base64url string env vars are naturally stored as.
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Current push permission/subscription state for this browser, without prompting. */
export async function getPushSubscriptionStatus(): Promise<"unsupported" | "denied" | "subscribed" | "not-subscribed"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing ? "subscribed" : "not-subscribed";
}

/** One-line, human-readable detail on *why* getPushSubscriptionStatus landed where it did — for on-screen diagnosis when a device's result is unexpected and devtools aren't reachable. */
export async function getPushDiagnosticDetail(): Promise<string> {
  const hasSW = "serviceWorker" in navigator;
  const hasPM = "PushManager" in window;
  if (!hasSW || !hasPM) {
    return `serviceWorker: ${hasSW ? "yes" : "no"}, PushManager: ${hasPM ? "yes" : "no"}, secure context: ${window.isSecureContext ? "yes" : "no"}, UA: ${navigator.userAgent}`;
  }
  try {
    const permission = Notification.permission;
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    return `permission: ${permission}, sw scope: ${registration.scope}, existing subscription: ${existing ? "yes" : "no"}`;
  } catch (err) {
    return `threw while checking: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Requests permission (if needed) and subscribes this browser, registering it with the host. */
export async function subscribeToPush(vapidPublicKey: string): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new PushApiError("Push notifications aren't supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushApiError("Notification permission was not granted.");
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
  });

  await unwrap(
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscriptionToJson(subscription)),
    })
  );
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await unwrap(
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    })
  );
}
