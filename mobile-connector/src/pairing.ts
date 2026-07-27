// Stores this device's connector credentials — the same three fields the QR
// code from the Devices admin screen encodes (hostUrl/deviceId/deviceToken).
// Kept in expo-secure-store (Android Keystore-backed), never plain storage,
// since deviceToken is a real bearer credential (see authenticateConnector
// in the main app's lib/core/connectors).

import * as SecureStore from "expo-secure-store";

const KEY = "tikas_connector_pairing";

export interface Pairing {
  hostUrl: string;
  deviceId: string;
  deviceToken: string;
  deviceName?: string;
  lastSyncAt?: string;
}

export async function loadPairing(): Promise<Pairing | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Pairing;
  } catch {
    return null;
  }
}

export async function savePairing(pairing: Pairing): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(pairing));
}

export async function clearPairing(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

/** Parses a scanned QR payload — the exact JSON shape the Devices admin screen encodes. */
export function parsePairingPayload(raw: string): Pairing | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as Record<string, unknown>).hostUrl !== "string" ||
    typeof (data as Record<string, unknown>).deviceId !== "string" ||
    typeof (data as Record<string, unknown>).deviceToken !== "string"
  ) {
    return null;
  }
  const p = data as Record<string, string>;
  return { hostUrl: p.hostUrl, deviceId: p.deviceId, deviceToken: p.deviceToken };
}
