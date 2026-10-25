import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet, AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import PairingScreen from "./src/screens/PairingScreen";
import StatusScreen from "./src/screens/StatusScreen";
import { loadPairing, type Pairing } from "./src/pairing";
import { registerBackgroundSync } from "./src/background";
import { registerLocationReporting } from "./src/location";
import { logEvent } from "./src/debug-log"; // TEMPORARY — see src/debug-log.ts

export default function App() {
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    loadPairing().then(setPairing);
  }, []);

  // TEMPORARY — see src/debug-log.ts. Tests the hypothesis that observed
  // location readings actually correlate with the app being opened/
  // foregrounded, rather than the background tasks genuinely firing on
  // their own schedule.
  useEffect(() => {
    logEvent("app_state", { state: AppState.currentState });
    const subscription = AppState.addEventListener("change", (nextState) => {
      logEvent("app_state", { state: nextState });
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (pairing) registerBackgroundSync().catch((err) => console.warn("Could not register background sync:", err));
  }, [pairing]);

  useEffect(() => {
    // No-ops if location permission hasn't been granted yet — StatusScreen's
    // "Enable Location Sharing" button is what actually requests it. This
    // just re-registers the background task on every app open in case
    // permission was already granted in a prior session.
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
