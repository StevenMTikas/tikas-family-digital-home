// Location reporting for the family-location feature — see
// docs/02_Modules/Location_Tracking.md ("Direction chosen").
//
// The phone does NO continuous tracking. Real-device testing showed Android's
// Doze power management defeats continuous background location once the phone
// is on battery (the stream delivered nothing, and the polling fallback
// returned stale network-cache fixes), so a reading is produced only when:
//
//   1. push_refresh — the host pushes a "report now" signal because someone
//      opened /location (handled in push.ts; this is the main path),
//   2. foreground   — the app itself is opened,
//   3. heartbeat    — an hourly BackgroundFetch poll, kept only so the 7-day
//      emergency history isn't empty between checks. Best-effort and often
//      stale, which is why the host labels these readings "approximate".
//
// A phone-side "sharing" flag is the single source of truth for whether this
// phone may report at all: when it's off, pushes are ignored and the heartbeat
// is unregistered, regardless of what the host asks.

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as SecureStore from "expo-secure-store";
import { loadPairing } from "./pairing";
import { postLocation, type ReportSource } from "./api";
import { logEvent } from "./debug-log"; // TEMPORARY — see debug-log.ts

const HEARTBEAT_TASK_NAME = "tikas-connector-location-heartbeat";
const HEARTBEAT_INTERVAL_SECONDS = 60 * 60; // a floor, not a guarantee; the OS decides the real cadence
const SHARING_FLAG_KEY = "location_sharing_on";
const FIX_TIMEOUT_MS = 15_000;
const FOREGROUND_MIN_GAP_MS = 60_000;

// Task names used by earlier builds (continuous stream; 15-minute poll). They
// stay registered with the OS across an app update, so each launch retires them.
const LEGACY_STREAM_TASK = "tikas-connector-background-location";
const LEGACY_POLL_TASK = "tikas-connector-location-fallback-poll";

TaskManager.defineTask(HEARTBEAT_TASK_NAME, async () => {
  logEvent("heartbeat_fired");
  if (!(await isLocationSharingOn())) return BackgroundFetch.BackgroundFetchResult.NoData;

  const ok = await captureAndReportFix("heartbeat");
  return ok ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.Failed;
});

// --- Getting a genuinely fresh fix from the background -----------------------
//
// Android throttles background apps to a few location updates per hour and
// otherwise hands back a CACHED position — a real-device test (2026-10-25)
// showed a push wake returning a 5-minute-old, 100m-accuracy fix in 44ms. An
// app running a foreground service is exempt, and Android allows starting one
// from the high-priority push that woke us. So a background request starts a
// short-lived foreground-service location burst (seconds, with a brief
// notification), takes the first genuinely fresh fix, and stops it again —
// unlike the long-lived continuous stream that Doze killed, this only has to
// survive a few seconds.

const BURST_TASK_NAME = "tikas-connector-location-burst";
const BURST_BUDGET_MS = 12_000;
const FRESH_MAX_AGE_MS = 15_000;
const FRESH_MAX_ACCURACY_M = 100;

/** Set only while a burst is running; the burst task hands each location to it. */
let onBurstLocation: ((loc: Location.LocationObject) => void) | null = null;

TaskManager.defineTask(BURST_TASK_NAME, async ({ data, error }) => {
  if (error || !onBurstLocation) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  for (const loc of locations) onBurstLocation(loc);
});

function isFreshFix(loc: Location.LocationObject): boolean {
  return Date.now() - loc.timestamp <= FRESH_MAX_AGE_MS && (loc.coords.accuracy ?? Infinity) <= FRESH_MAX_ACCURACY_M;
}

/** Returns the freshest fix seen within the budget (null if none arrived at all). Always stops the service. */
async function getFixViaForegroundServiceBurst(): Promise<Location.LocationObject | null> {
  const state: { best: Location.LocationObject | null } = { best: null };
  let resolveFresh: () => void = () => {};
  const freshArrived = new Promise<void>((resolve) => {
    resolveFresh = resolve;
  });

  onBurstLocation = (loc) => {
    if (!state.best || loc.timestamp > state.best.timestamp) state.best = loc;
    if (isFreshFix(loc)) resolveFresh();
  };

  try {
    await Location.startLocationUpdatesAsync(BURST_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: false,
      timeInterval: 1000,
      distanceInterval: 0,
      foregroundService: {
        notificationTitle: "Tikas Connector",
        notificationBody: "Checking your location for your family…",
        killServiceOnDestroy: true,
      },
    });
    await Promise.race([freshArrived, new Promise<void>((resolve) => setTimeout(resolve, BURST_BUDGET_MS))]);
  } finally {
    onBurstLocation = null;
    await Location.stopLocationUpdatesAsync(BURST_TASK_NAME).catch(() => {});
  }
  return state.best;
}

/**
 * Foreground (app open): a plain request is fresh and fast. Background (push
 * wake, heartbeat): try the foreground-service burst first, and fall back to a
 * plain request if it can't start (e.g. a heartbeat has no push to exempt it).
 */
async function acquireFix(mode: "foreground" | "background"): Promise<{ fix: Location.LocationObject; method: "burst" | "current" }> {
  if (mode === "background") {
    try {
      const burst = await getFixViaForegroundServiceBurst();
      if (burst) return { fix: burst, method: "burst" };
    } catch (err) {
      logEvent("burst_failed", { message: err instanceof Error ? err.message : String(err) });
    }
  }
  const fix = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false }),
    FIX_TIMEOUT_MS
  );
  return { fix, method: "current" };
}

function isRunningInExpoGo(): boolean {
  return typeof expo !== "undefined" && !!(globalThis as any).expo?.modules?.ExpoGo;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function isLocationSharingOn(): Promise<boolean> {
  return (await SecureStore.getItemAsync(SHARING_FLAG_KEY)) === "1";
}

/**
 * Takes one fresh GPS fix and reports it to the host, tagged with how it was
 * triggered. Returns whether a reading was actually delivered. Never throws —
 * every caller is a background handler that must finish quietly.
 */
export async function captureAndReportFix(source: ReportSource): Promise<boolean> {
  try {
    const pairing = await loadPairing();
    if (!pairing) return false;

    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return false;

    const startedAt = Date.now();
    // mayShowUserSettingsDialog (set false inside acquireFix) defaults to true
    // on Android and tries to show a system dialog; background handlers have
    // no screen to show it on, and it can make the call quietly return a stale
    // fix instead of failing.
    const { fix, method } = await acquireFix(source === "foreground" ? "foreground" : "background");

    // TEMPORARY diagnostics: fixAgeSeconds is how old the fix is on arrival —
    // ~0-2s for a genuinely fresh fix, minutes for a stale cache hit.
    logEvent(`fix_${source}`, {
      method,
      fresh: isFreshFix(fix),
      accuracyM: fix.coords.accuracy,
      mocked: fix.mocked,
      fixAgeSeconds: Math.round((Date.now() - fix.timestamp) / 1000),
      tookMs: Date.now() - startedAt,
    });

    await postLocation(pairing, {
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      accuracyM: fix.coords.accuracy ?? undefined,
      recordedAt: new Date(fix.timestamp).toISOString(),
      source,
    });
    return true;
  } catch (err) {
    logEvent(`fix_${source}_failed`, { message: err instanceof Error ? err.message : String(err) });
    console.warn(`Location report (${source}) failed:`, err);
    return false;
  }
}

let lastForegroundReportAt = 0;

/** Reports a fresh fix when the app is opened — cheap, and as reliable as anything gets. Rate-limited so rapid app switching can't spam. */
export async function reportForegroundFix(): Promise<void> {
  if (!(await isLocationSharingOn())) return;
  if (Date.now() - lastForegroundReportAt < FOREGROUND_MIN_GAP_MS) return;
  lastForegroundReportAt = Date.now();
  await captureAndReportFix("foreground");
}

/**
 * Unregisters task names left behind by earlier builds. Safe to call on every
 * launch. Returns whether any were found — i.e. whether this phone had sharing
 * on under the old build, so the choice can carry over without a re-enable.
 */
async function retireLegacyTasks(): Promise<boolean> {
  let found = false;
  try {
    if (await TaskManager.isTaskRegisteredAsync(LEGACY_STREAM_TASK)) {
      found = true;
      await Location.stopLocationUpdatesAsync(LEGACY_STREAM_TASK);
    }
  } catch (err) {
    console.warn("Could not retire legacy location stream:", err);
  }
  try {
    if (await TaskManager.isTaskRegisteredAsync(LEGACY_POLL_TASK)) {
      found = true;
      await BackgroundFetch.unregisterTaskAsync(LEGACY_POLL_TASK);
    }
  } catch (err) {
    console.warn("Could not retire legacy location poll:", err);
  }
  return found;
}

async function ensureHeartbeatRegistered(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (status === BackgroundFetch.BackgroundFetchStatus.Restricted || status === BackgroundFetch.BackgroundFetchStatus.Denied) {
    return; // the OS has disabled background execution for this app — nothing to do from here
  }
  if (await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK_NAME)) return;
  await BackgroundFetch.registerTaskAsync(HEARTBEAT_TASK_NAME, {
    minimumInterval: HEARTBEAT_INTERVAL_SECONDS,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}

/**
 * Called on every app open once paired: retires leftovers from earlier builds
 * and, if sharing is on, makes sure the heartbeat is registered. Never prompts.
 */
export async function registerLocationReporting(): Promise<void> {
  if (isRunningInExpoGo()) return;
  const hadLegacySharing = await retireLegacyTasks();
  if (hadLegacySharing && (await SecureStore.getItemAsync(SHARING_FLAG_KEY)) === null) {
    await SecureStore.setItemAsync(SHARING_FLAG_KEY, "1");
  }

  if (!(await isLocationSharingOn())) return;
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== "granted") return;
  await ensureHeartbeatRegistered();
}

/** Asks for the permissions this feature needs (foreground, then "all the time"). */
export async function requestLocationPermissions(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") return false;
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === "granted";
}

/** Turns sharing on for this phone: records the choice, registers the heartbeat, and reports once right away. */
export async function enableLocationSharing(): Promise<boolean> {
  if (!(await requestLocationPermissions())) return false;
  await SecureStore.setItemAsync(SHARING_FLAG_KEY, "1");
  if (!isRunningInExpoGo()) await ensureHeartbeatRegistered();
  await reportForegroundFix();
  return true;
}

/** Turns sharing off for this phone: pushes are ignored and the heartbeat stops. */
export async function disableLocationSharing(): Promise<void> {
  await SecureStore.setItemAsync(SHARING_FLAG_KEY, "0");
  if (await TaskManager.isTaskRegisteredAsync(HEARTBEAT_TASK_NAME)) {
    await BackgroundFetch.unregisterTaskAsync(HEARTBEAT_TASK_NAME);
  }
}
