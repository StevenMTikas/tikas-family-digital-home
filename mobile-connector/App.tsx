import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet, AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import PairingScreen from "./src/screens/PairingScreen";
import StatusScreen from "./src/screens/StatusScreen";
import { loadPairing, type Pairing } from "./src/pairing";
import { registerBackgroundSync } from "./src/background";
import { registerLocationReporting, reportForegroundFix } from "./src/location";
// Importing push.ts at module scope is what defines the background push task
// (it must exist before a push can wake the app, including headless starts).
import { registerPushWake } from "./src/push";

export default function App() {
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    loadPairing().then(setPairing);
  }, []);

  // Whenever the app is brought to the front, report one fresh fix (a no-op if
  // sharing is off; rate-limited inside reportForegroundFix).
  useEffect(() => {
    if (!pairing) return;
    reportForegroundFix().catch((err) => console.warn("Foreground location report failed:", err));
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") reportForegroundFix().catch((err) => console.warn("Foreground location report failed:", err));
    });
    return () => subscription.remove();
  }, [pairing]);

  useEffect(() => {
    if (pairing) registerBackgroundSync().catch((err) => console.warn("Could not register background sync:", err));
  }, [pairing]);

  useEffect(() => {
    // Silent (never prompts) — keeps the push token current on every open.
    if (pairing) registerPushWake(false).catch((err) => console.warn("Could not register push wake:", err));
  }, [pairing]);

  useEffect(() => {
    // Never prompts — StatusScreen's "Enable Location Sharing" button is what
    // actually requests permission. This retires tasks left by earlier builds
    // and re-registers the hourly heartbeat on every open if sharing is on.
    if (pairing) registerLocationReporting().catch((err) => console.warn("Could not register location reporting:", err));
  }, [pairing]);

  if (pairing === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <>
      {pairing ? (
        <StatusScreen pairing={pairing} onUnpaired={() => setPairing(null)} />
      ) : (
        <PairingScreen onPaired={setPairing} />
      )}
      <StatusBar style="auto" />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
