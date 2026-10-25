"use client";

// See docs/02_Modules/Location_Tracking.md. Mutual current-position list for
// everyone, a self-only sharing toggle (locked for a minor), and a Super
// Admin-only 7-day history expansion per family member.

import { useEffect, useState } from "react";
import {
  getCurrentLocations,
  getLocationSettings,
  setLocationSharingEnabled,
  getLocationHistory,
  LocationApiError,
  type CurrentLocation,
  type LocationSettings,
  type LocationHistoryEntry,
} from "@/lib/api/location";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function coords(loc: { latitude: number; longitude: number }): string {
  return `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
}

// OpenStreetMap's free embed — no API key, same "no new paid dependency"
// approach the app already uses for weather (Open-Meteo). Note this means
// the *viewer's own browser* fetches public map tiles for a location it can
// already see on-screen — a different, much smaller exposure than a phone
// ever reporting to a third party, which the rest of this module is
// designed to prevent entirely (see Location_Tracking.md).
const MAP_SPAN_DEG = 0.006; // ~650m across — enough context without being so zoomed out it's useless
function mapEmbedUrl(lat: number, lon: number): string {
  const bbox = [lon - MAP_SPAN_DEG, lat - MAP_SPAN_DEG, lon + MAP_SPAN_DEG, lat + MAP_SPAN_DEG].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;
}
function openMapUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

export default function LocationPageClient({ myUserId, isSuperAdmin }: { myUserId: string; isSuperAdmin: boolean }) {
  const [locations, setLocations] = useState<CurrentLocation[] | null>(null);
  const [settings, setSettings] = useState<LocationSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingToggle, setSavingToggle] = useState(false);
  const [openHistoryFor, setOpenHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<LocationHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    getCurrentLocations().then(setLocations).catch(() => setLocations([]));
    getLocationSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  async function handleToggle(next: boolean) {
    if (!settings || savingToggle) return;
    setSavingToggle(true);
    setSettingsError(null);
    try {
      const updated = await setLocationSharingEnabled(next);
      setSettings({ ...settings, locationSharingEnabled: updated.locationSharingEnabled });
    } catch (err) {
      setSettingsError(err instanceof LocationApiError ? err.message : "Couldn't update that setting.");
    } finally {
      setSavingToggle(false);
    }
  }

  async function handleViewHistory(userId: string) {
    if (openHistoryFor === userId) {
      setOpenHistoryFor(null);
      setHistory(null);
      return;
    }
    setOpenHistoryFor(userId);
    setHistory(null);
    setHistoryLoading(true);
    try {
      setHistory(await getLocationHistory(userId));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <main className="p-6 max-w-[560px]">
      <h1 className="font-display text-2xl font-medium">Location</h1>
      <p className="text-ink-muted text-sm mt-1">Where your family is right now.</p>

      <div className="bg-surface rounded-2xl p-4 shadow-[0_8px_20px_rgba(58,52,44,0.05)] mt-5 flex items-center justify-between">
        <div>
          <div className="text-[13.5px] text-ink font-medium">Share my location</div>
          {settings?.isMinor ? (
            <div className="text-xs text-ink-muted mt-0.5">Your location is shared with your family.</div>
          ) : (
            <div className="text-xs text-ink-muted mt-0.5">Visible to every family member.</div>
          )}
        </div>
        {settings && !settings.isMinor && (
          <button
            type="button"
            role="switch"
            aria-checked={settings.locationSharingEnabled}
            disabled={savingToggle}
            onClick={() => handleToggle(!settings.locationSharingEnabled)}
            className={`w-11 h-6 rounded-full transition-colors relative disabled:opacity-60 ${
              settings.locationSharingEnabled ? "bg-accent-strong" : "bg-ink/20"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                settings.locationSharingEnabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        )}
      </div>
      {settingsError && (
        <p role="alert" className="text-xs text-urgent mt-2">
          {settingsError}
        </p>
      )}

      <div className="flex flex-col gap-2 mt-5">
        {locations === null && <p className="text-sm text-ink-muted">Loading…</p>}
        {locations?.length === 0 && <p className="text-sm text-ink-muted">No one is currently sharing their location.</p>}
        {locations?.map((loc) => (
          <div key={loc.userId} className="bg-surface rounded-2xl p-4 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13.5px] text-ink font-medium">
                  {loc.fullName}
                  {loc.userId === myUserId ? " (you)" : ""}
                </div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {coords(loc)} · updated {relativeTime(loc.recordedAt)}
                </div>
              </div>
              {isSuperAdmin && (
                <button type="button" onClick={() => handleViewHistory(loc.userId)} className="text-xs text-ink-muted underline shrink-0">
                  {openHistoryFor === loc.userId ? "Hide history" : "View 7-day history"}
                </button>
              )}
            </div>

            <div className="mt-3 rounded-xl overflow-hidden border border-ink/10">
              <iframe
                title={`Map of ${loc.fullName}'s location`}
                src={mapEmbedUrl(loc.latitude, loc.longitude)}
                className="w-full h-[180px] border-0 block"
                loading="lazy"
              />
            </div>
            <a
              href={openMapUrl(loc.latitude, loc.longitude)}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-ink-muted underline inline-block mt-1.5"
            >
              Open in Maps
            </a>

            {isSuperAdmin && openHistoryFor === loc.userId && (
              <div className="mt-3 pt-3 border-t border-ink/10 flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {historyLoading && <p className="text-xs text-ink-muted">Loading history…</p>}
                {history?.length === 0 && <p className="text-xs text-ink-muted">No readings in the last 7 days.</p>}
                {history?.map((entry, i) => (
                  <div key={i} className="text-xs text-ink-muted flex justify-between">
                    <span>{coords(entry)}</span>
                    <span>{new Date(entry.recordedAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
