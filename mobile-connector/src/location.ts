// Background location reporting — see docs/02_Modules/Location_Tracking.md.
// Deliberately a separate registered task from background.ts's file-sync
// task: different permission (location, not media library), different
// cadence, and a different host endpoint.
//
// Two independent mechanisms, not one:
//
// 1. A continuous location-updates task (startLocationUpdatesAsync) — gives
//    good real-time granularity while it's alive, but real-device testing
//    (2026-08-23) showed Android can still kill this continuous subscription
//    after ~10-20 minutes even with the app's battery setting on
//    "Unrestricted" — a known hard problem, worse on some OEM skins
//    (Motorola in this case) that apply their own process management on top
//    of the stock Android battery API. When it dies, it does NOT
//    automatically restart itself.
// 2. A BackgroundFetch one-shot poll (registerLocationFallbackPoll), same
//    proven mechanism background.ts already uses for file sync — a periodic
//    OS-scheduled wake that grabs a single fresh fix and posts it,
//    independent of whether mechanism #1 is still alive. This is the real
//    reliability floor: even if the continuous stream dies, this still
//    delivers something roughly every 15-30 min (best-effort, same honesty
//    as file sync's own documented cadence).

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import { loadPairing } from "./pairing";
import { postLocation } from "./api";
import { logEvent } from "./debug-log"; // TEMPORARY — see debug-log.ts

const STREAM_TASK_NAME = "tikas-connector-background-location";
const FALLBACK_TASK_NAME = "tikas-connector-location-fallback-poll";
const MIN_INTERVAL_MS = 5 * 60 * 1000; // best-effort floor for the continuous stream; Android's scheduler is the real cap

TaskManager.defineTask(STREAM_TASK_NAME, async ({ data, error }) => {
  // Logged unconditionally, before any early return — the whole point is to
  // find out whether this callback fires in the background AT ALL. See
  // debug-log.ts.
  logEvent("stream_task_fired", {
    hasError: !!error,
    errorMessage: error ? String(error) : undefined,
    locationCount: (data as { locations?: Location.LocationObject[] } | undefined)?.locations?.length ?? 0,
  });

  if (error) {
    console.warn("Background location task error:", error);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const latest = locations?.[locations.length - 1];
  if (!latest) return;
  logEvent("stream_task_location", {
    lat: latest.coords.latitude,
    lon: latest.coords.longitude,
    accuracyM: latest.coords.accuracy,
    mocked: latest.mocked,
    fixTimestamp: new Date(latest.timestamp).toISOString(),
  });
  await reportLocation(latest);
});

TaskManager.defineTask(FALLBACK_TASK_NAME, async () => {
  logEvent("fallback_task_fired");

  const pairing = await loadPairing();
  if (!pairing) {
    logEvent("fallback_task_no_pairing");
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== "granted") {
    logEvent("fallback_task_no_permission", { status });
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  try {
    // mayShowUserSettingsDialog defaults to true on Android — it prompts
    // for improved-accuracy mode (GPS+WiFi+cell) via a system dialog. This
    // task runs headless with no Activity to show that dialog on; real
    // multi-trip device testing (2026-08-23/24) showed exactly the
    // no-error, silently-stale-location symptom that produces — every
    // fallback-poll reading stayed within meters of home regardless of
    // actual movement, with no thrown error to explain why. Explicitly
    // disabling it (and requesting High rather than Balanced accuracy) is
    // the fix being tested next.
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false });
    logEvent("fallback_task_location", {
      lat: fix.coords.latitude,
      lon: fix.coords.longitude,
      accuracyM: fix.coords.accuracy,
      mocked: fix.mocked,
      fixTimestamp: new Date(fix.timestamp).toISOString(),
    });
    await reportLocation(fix);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    logEvent("fallback_task_error", { message: err instanceof Error ? err.message : String(err) });
    console.warn("Location fallback poll failed:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

async function reportLocation(fix: Location.LocationObject): Promise<void> {
  const pairing = await loadPairing();
  if (!pairing) return;

  try {
    await postLocation(pairing, {
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      accuracyM: fix.coords.accuracy ?? undefined,
      recordedAt: new Date(fix.timestamp).toISOString(),
    });
    logEvent("report_location_ok");
  } catch (err) {
    logEvent("report_location_failed", { message: err instanceof Error ? err.message : String(err) });
    console.warn("Location report failed:", err);
  }
}

// Background location is unavailable in Expo Go (same constraint as
// background.ts's file-sync task) — only meaningful once this runs as a
// standalone/dev-client build.
function isRunningInExpoGo(): boolean {
  return typeof expo !== "undefined" && !!(globalThis as any).expo?.modules?.ExpoGo;
}

export async function registerLocationReporting(): Promise<void> {
  if (isRunningInExpoGo()) return;

  const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
  if (foregroundStatus !== "granted") return; // caller is responsible for prompting first — see StatusScreen.tsx

  const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
  if (backgroundStatus !== "granted") return;

  const streamAlreadyRegistered = await TaskManager.isTaskRegisteredAsync(STREAM_TASK_NAME);
  logEvent("register_called", { streamAlreadyRegistered });
  if (!streamAlreadyRegistered) {
    await Location.startLocationUpdatesAsync(STREAM_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: false, // see the fallback task's comment — same headless-task reasoning applies here
      timeInterval: MIN_INTERVAL_MS,
      // 500m, not 100 — real-device testing showed 100m fired every few
      // seconds at driving speed (Android appears to treat timeInterval and
      // distanceInterval as "whichever comes first," not "at least
      // timeInterval apart"), which is real unwanted battery/data cost, not
      // just extra precision.
      distanceInterval: 500,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: "Tikas Connector",
        notificationBody: "Sharing your location with your family.",
      },
    });
  }

  const fallbackAlreadyRegistered = await TaskManager.isTaskRegisteredAsync(FALLBACK_TASK_NAME);
  if (!fallbackAlreadyRegistered) {
    await BackgroundFetch.registerTaskAsync(FALLBACK_TASK_NAME, {
      minimumInterval: 15 * 60, // seconds — a floor, not a guarantee; matches background.ts's file-sync cadence
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
}

export async function unregisterLocationReporting(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(STREAM_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(STREAM_TASK_NAME);
  }
  if (await TaskManager.isTaskRegisteredAsync(FALLBACK_TASK_NAME)) {
    await BackgroundFetch.unregisterTaskAsync(FALLBACK_TASK_NAME);
  }
}

export async function isLocationReportingActive(): Promise<boolean> {
  // "Active" means the fallback poll is registered — it's the reliability
  // floor. The continuous stream is a bonus on top when it's alive, but its
  // own registration state isn't a trustworthy signal by itself (real-device
  // testing showed it can silently stop delivering updates while still
  // reporting itself as registered).
  return TaskManager.isTaskRegisteredAsync(FALLBACK_TASK_NAME);
}

export async function requestLocationPermissions(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === "granted";
}
