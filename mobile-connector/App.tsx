import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import PairingScreen from "./src/screens/PairingScreen";
import StatusScreen from "./src/screens/StatusScreen";
import { loadPairing, type Pairing } from "./src/pairing";
import { registerBackgroundSync } from "./src/background";

export default function App() {
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    loadPairing().then(setPairing);
  }, []);

  useEffect(() => {
    if (pairing) registerBackgroundSync().catch((err) => console.warn("Could not register background sync:", err));
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
