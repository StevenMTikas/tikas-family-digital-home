// Scan the QR code shown on the Devices admin screen (Administration →
// Devices → Add Device, phone type) to pair this app, instead of the
// desktop connector's copy-paste-into-config-file flow. See
// File_Connector_Architecture.md's Setup & Pairing section.

import { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Button } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { getPendingRequests } from "../api";
import { parsePairingPayload, savePairing, type Pairing } from "../pairing";

export default function PairingScreen({ onPaired }: { onPaired: (pairing: Pairing) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleScan(result: BarcodeScanningResult) {
    if (scanned) return;
    setScanned(true);
    setError(null);

    const pairing = parsePairingPayload(result.data);
    if (!pairing) {
      setError("That QR code isn't a valid Tikas pairing code. Generate a new one from the Devices admin screen and try again.");
      setScanned(false);
      return;
    }

    setStatus("Verifying with the family app…");
    try {
      // Confirm the credentials actually work before declaring "paired" —
      // fails loudly here instead of silently on the first real sync.
      await getPendingRequests(pairing);
      await savePairing(pairing);
      onPaired(pairing);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't verify pairing: ${err.message}. Check that this phone can reach ${pairing.hostUrl} and try again.`
          : "Couldn't verify pairing."
      );
      setScanned(false);
    } finally {
      setStatus(null);
    }
  }

  if (!permission) {
    return <View style={styles.center} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Tikas Connector needs camera access to scan the pairing code.</Text>
        <Button title="Grant Camera Access" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : handleScan}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>
          Scan the pairing QR code from Administration → Devices in the family app
        </Text>
        {status && (
          <View style={styles.statusRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.overlayText}>{status}</Text>
          </View>
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  text: { textAlign: "center", marginBottom: 12 },
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    gap: 10,
  },
  overlayText: { color: "#fff", textAlign: "center" },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  errorText: { color: "#ff8a80", textAlign: "center" },
});
