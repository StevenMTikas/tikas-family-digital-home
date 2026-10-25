// Thin typed API client for Location Tracking — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section and docs/02_Modules/Location_Tracking.md.

export interface CurrentLocation {
  userId: string;
  fullName: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
}

export interface LocationHistoryEntry {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
}

export interface LocationSettings {
  locationSharingEnabled: boolean;
  isMinor: boolean;
}

export class LocationApiError extends Error {}

async function unwrap<T>(resPromise: Response | Promise<Response>): Promise<T> {
  const res = await resPromise;
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new LocationApiError(body?.error?.message ?? "Request failed.");
  }
  return res.json();
}

export function getCurrentLocations(): Promise<CurrentLocation[]> {
  return unwrap(fetch("/api/location"));
}

export function getLocationSettings(): Promise<LocationSettings> {
  return unwrap(fetch("/api/location/settings"));
}

export async function setLocationSharingEnabled(enabled: boolean): Promise<LocationSettings> {
  const data = await unwrap<{ locationSharingEnabled: boolean }>(
    fetch("/api/location/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationSharingEnabled: enabled }),
    })
  );
  return { ...data, isMinor: false };
}

export function getLocationHistory(userId: string): Promise<LocationHistoryEntry[]> {
  return unwrap(fetch(`/api/location/history/${userId}`));
}
