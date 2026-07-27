// Paired-state home screen: shows what's synced, a manual "Sync Now" button
// (a deliberate exception to the desktop connector's "no manual sync" rule —
// see File_Connector_Architecture.md's Sync Mechanics), and unpair.

import { useState, useCallback } from "react";
import { View, Text, StyleSheet, Button, ActivityIndicator, ScrollView, Alert } from "react-native";
import * as MediaLibrary from "expo-media-library";
import { runSync, pollPendingRequests } from "../sync";
import { clearThumbnailCache } from "../thumbnail-cache";
import { savePairing, clearPairing, type Pairing } from "../pairing";

export default function StatusScreen({ pairing, onUnpaired }: { pairing: Pairing; onUnpaired: () => void }) {
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>(pairing.lastSyncAt);
  const [error, setError] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    if (!mediaPermission?.granted) {
      const res = await requestMediaPermission();
      if (!res.granted) {
        setError("Photo access is required to sync your camera roll.");
        return;
      }
    }

    setSyncing(true);
    setError(null);
    setProgress("Scanning camera roll…");
    try {
      const result = await runSync(pairing, (scanned) => setProgress(`Scanning camera roll… ${scanned} so far`));
      setProgress("Checking for requested files…");
      const pendingResult = await pollPendingRequests(pairing);

      const now = new Date().toISOString();
      setLastSyncAt(now);
      await savePairing({ ...pairing, lastSyncAt: now });
      setLastResult(
        `${result.created} new, ${result.updated} updated, ${result.removed} removed. ${pendingResult.fulfilled} requested file(s) sent.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  }, [pairing, mediaPermission, requestMediaPermission]);

  function handleUnpair() {
    Alert.alert("Unpair this phone?", "The family app admin will need to generate a new pairing code to reconnect it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unpair",
        style: "destructive",
        onPress: async () => {
          await clearPairing();
          // Drop the thumbnail cache too — it records what a *specific* host
          // already has. Re-pairing (possibly to a different host) must start
          // from scratch, not silently skip sending thumbnails it never got.
          await clearThumbnailCache();
          onUnpaired();
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Tikas Connector</Text>
      <Text style={styles.subtitle}>Paired with {pairing.hostUrl}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Last sync</Text>
        <Text style={styles.value}>{lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Never"}</Text>
      </View>

      {lastResult && (
        <View style={styles.card}>
          <Text style={styles.label}>Last result</Text>
          <Text style={styles.value}>{lastResult}</Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {syncing ? (
        <View style={styles.syncingRow}>
          <ActivityIndicator />
          <Text style={styles.value}>{progress}</Text>
        </View>
      ) : (
        <Button title="Sync Now" onPress={handleSync} />
      )}

      <View style={styles.spacer} />
      <Button title="Unpair This Phone" color="#b3261e" onPress={handleUnpair} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: "600" },
  subtitle: { color: "#666", marginBottom: 8 },
  card: { backgroundColor: "#f2f2f2", borderRadius: 12, padding: 14 },
  label: { fontSize: 12, color: "#666", textTransform: "uppercase", marginBottom: 4 },
  value: { fontSize: 14 },
  error: { color: "#b3261e" },
  syncingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  spacer: { height: 24 },
});
