// Best-effort background sync — Android's BackgroundFetch/WorkManager
// schedules this OS-controlled, opportunistically. It is NOT a guaranteed
// daily run like the desktop connector's setInterval; realistically it fires
// somewhere between every 15 minutes and much less often depending on
// battery state and OEM restrictions. Combined with the foreground sync on
// app open, the honest guarantee is "syncs when opened, plus a best-effort
// attempt in the background." See File_Connector_Architecture.md's Phase 3
// note on the phone connector.

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { loadPairing, savePairing } from "./pairing";
import { runSync, pollPendingRequests } from "./sync";

const TASK_NAME = "tikas-connector-background-sync";

TaskManager.defineTask(TASK_NAME, async () => {
  const pairing = await loadPairing();
  if (!pairing) return BackgroundFetch.BackgroundFetchResult.NoData;

  try {
    await runSync(pairing);
    await pollPendingRequests(pairing);
    await savePairing({ ...pairing, lastSyncAt: new Date().toISOString() });
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.warn("Background sync failed:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Background Fetch is unavailable in Expo Go entirely (its own error says
// so: "You can use this API, and all others, in a development build") — so
// registering there just throws/warns on every launch for no benefit. Same
// runtime check expo-media-library's own legacy module uses internally.
// Real background execution only needs testing once this runs as a
// standalone/dev-client build, not while iterating in Expo Go.
function isRunningInExpoGo(): boolean {
  return typeof expo !== "undefined" && !!(globalThis as any).expo?.modules?.ExpoGo;
}

export async function registerBackgroundSync(): Promise<void> {
  if (isRunningInExpoGo()) return;

  const status = await BackgroundFetch.getStatusAsync();
  if (status === BackgroundFetch.BackgroundFetchStatus.Restricted || status === BackgroundFetch.BackgroundFetchStatus.Denied) {
    return; // OS has disabled background execution for this app — nothing we can do from here
  }

  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (alreadyRegistered) return;

  await BackgroundFetch.registerTaskAsync(TASK_NAME, {
    minimumInterval: 15 * 60, // seconds — a floor, not a guarantee; the OS decides actual cadence
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
