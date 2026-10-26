// Push-triggered on-demand location refresh — the phone side of the design in
// docs/02_Modules/Location_Tracking.md ("Direction chosen").
//
// When a family member opens /location, the host sends this phone a
// high-priority, data-only push through Firebase Cloud Messaging. The payload
// carries no location data — only a "report now" signal. This module wakes on
// it (even if the app is closed), takes one fresh GPS fix, and answers over
// the normal device-authenticated connector endpoint, so a spoofed or replayed
// push can't inject a position.
//
// The task is defined at module scope on purpose: it has to exist before a
// push arrives, including when Android starts the app headless just to
// deliver one. App.tsx imports this file at the top for that reason.

import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { loadPairing } from "./pairing";
import { postPushToken } from "./api";
import { captureAndReportFix, isLocationSharingOn } from "./location";
import { logEvent } from "./debug-log"; // TEMPORARY — see debug-log.ts

const PUSH_TASK_NAME = "tikas-connector-push-wake";
const CHANNEL_ID = "location-requests";

// A refresh request is silent by design; nothing should pop up on its own.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * The task callback receives { data: NotificationTaskPayload }, and on Android
 * the FCM data map sits inside that payload as a JSON string at
 * `data.data.dataString` — one level deeper than it first looks. (The first
 * version read `data.dataString`, found nothing, and silently ignored every
 * push; only a real-device smoke test could have caught that.) Checks every
 * plausible location rather than trusting one.
 */
function extractPayload(body: any): Record<string, unknown> {
  const taskData = body?.data; // the NotificationTaskPayload
  const candidates = [taskData?.data?.dataString, taskData?.dataString];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      try {
        return JSON.parse(candidate);
      } catch {
        /* try the next location */
      }
    }
  }
  // Already-parsed shapes: the map itself at data.data, or directly at data.
  if (taskData?.data && typeof taskData.data === "object" && typeof taskData.data.type === "string") return taskData.data;
  if (taskData && typeof taskData === "object" && typeof taskData.type === "string") return taskData;
  return {};
}

TaskManager.defineTask(PUSH_TASK_NAME, async (body: any) => {
  const payload = extractPayload(body);
  // TEMPORARY diagnostics: the only way to see, from the host, whether a push
  // actually woke the phone and how long it took. sentAt is the host's clock.
  logEvent("push_task_fired", {
    receivedAt: new Date().toISOString(),
    sentAt: payload.sentAt,
    nonce: payload.nonce,
    type: payload.type,
    hasError: !!body?.error,
    // Shape only, never values: confirms where the payload actually lives.
    shape: {
      dataKeys: Object.keys(body?.data ?? {}),
      innerDataKeys: Object.keys(body?.data?.data ?? {}),
    },
  });

  if (payload.type !== "location_refresh") return;

  // The phone-side switch always wins over what the host asks for.
  if (!(await isLocationSharingOn())) {
    logEvent("push_ignored_sharing_off");
    return;
  }

  const delivered = await captureAndReportFix("push_refresh");
  logEvent(delivered ? "push_wake_reported" : "push_wake_not_reported");
});

export type PushRegistrationResult = "registered" | "permission_denied" | "unsupported" | "error";

/**
 * Sets up push receipt: the notification channel, the notification permission,
 * the background task, and tells the host this phone's FCM token. With
 * promptIfNeeded=false it never shows a permission dialog, so it's safe to
 * call on every app open to keep the token current.
 */
export async function registerPushWake(promptIfNeeded: boolean): Promise<PushRegistrationResult> {
  if (Platform.OS !== "android") return "unsupported";
  if (typeof expo !== "undefined" && (globalThis as any).expo?.modules?.ExpoGo) return "unsupported";

  try {
    // Must exist before a token is requested on Android 13+.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Location requests",
      importance: Notifications.AndroidImportance.LOW,
    });

    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && promptIfNeeded && perm.canAskAgain) {
      perm = await Notifications.requestPermissionsAsync();
    }
    logEvent("push_permission", { granted: perm.granted, canAskAgain: perm.canAskAgain });
    if (!perm.granted) return "permission_denied";

    await Notifications.registerTaskAsync(PUSH_TASK_NAME);

    const pairing = await loadPairing();
    const token = await Notifications.getDevicePushTokenAsync();
    if (pairing && typeof token.data === "string") await postPushToken(pairing, token.data);
    logEvent("push_token_registered", { type: token.type });

    // FCM rotates tokens occasionally; the host must hear about the new one.
    Notifications.addPushTokenListener(async (t) => {
      const p = await loadPairing();
      if (p && typeof t.data === "string") await postPushToken(p, t.data).catch(() => {});
    });
    return "registered";
  } catch (err) {
    logEvent("push_register_error", { message: err instanceof Error ? err.message : String(err) });
    return "error";
  }
}
