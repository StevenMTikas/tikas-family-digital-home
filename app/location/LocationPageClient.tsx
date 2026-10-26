"use client";

// See docs/02_Modules/Location_Tracking.md. Mutual current-position list for
// everyone, a self-only sharing toggle (locked for a minor), and a Super
// Admin-only 7-day history expansion per family member.
//
// Positions are refreshed on demand, not tracked continuously: opening this
// page asks any stale family member's phone (via a push) for one fresh
// reading, then polls briefly for it to arrive. Anyone whose phone doesn't
// answer in time simply stays on their last known position, clearly labeled.

import { useEffect, useRef, useState } from "react";
import {
  getCurrentLocations,
  requestRefresh,
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

const POLL_EVERY_MS = 3000;
const GIVE_UP_AFTER_MS = 20_000;

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
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [noResponse, setNoResponse] = useState<Set<string>>(new Set());
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const unmounted = useRef(false);

  useEffect(() => {
    getCurrentLocations()
      .then((locs) => {
        setLocations(locs);
        startRefresh(undefined, locs);
      })
      .catch(() => setLocations([]));
    getLocationSettings().then(setSettings).catch(() => setSettings(null));
    return () => {
      unmounted.current = true;
    };
    // Runs once on open; startRefresh only reads state through its arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Polls until each requested person's reading changes, or gives up and marks them unreachable. */
  async function waitForFreshReadings(userIds: string[], baseline: Record<string, string>) {
    setRefreshing((prev) => new Set([...prev, ...userIds]));
    setNoResponse((prev) => new Set([...prev].filter((id) => !userIds.includes(id))));

    const pending = new Set(userIds);
    const deadline = Date.now() + GIVE_UP_AFTER_MS;
    while (pending.size > 0 && Date.now() < deadline && !unmounted.current) {
      await new Promise((resolve) => setTimeout(resolve, POLL_EVERY_MS));
      if (unmounted.current) return;
      const latest = await getCurrentLocations().catch(() => null);
      if (!latest) continue;
      setLocations(latest);
      for (const loc of latest) {
        if (pending.has(loc.userId) && loc.recordedAt !== baseline[loc.userId]) pending.delete(loc.userId);
      }
    }

    if (unmounted.current) return;
    setRefreshing((prev) => new Set([...prev].filter((id) => !userIds.includes(id))));
    if (pending.size > 0) setNoResponse((prev) => new Set([...prev, ...pending]));
  }

  async function startRefresh(userId?: string, current?: CurrentLocation[]) {
    const snapshot = current ?? locations ?? [];
    const baseline = Object.fromEntries(snapshot.map((l) => [l.userId, l.recordedAt]));
    try {
      const result = await requestRefresh(userId);
      if (!result.configured) {
        setRefreshNote("Live refresh isn't set up on this server yet — showing last known positions.");
        return;
      }
      if (result.requested.length === 0) {
        // Auto-refresh finding nothing to do is normal (everyone's fresh); only a manual
        // click deserves an explanation.
        if (userId) setRefreshNote("Just refreshed — try again in a minute.");
        return;
      }
      setRefreshNote(null);
      await waitForFreshReadings(result.requested, baseline);
    } catch {
      // Leave whatever last-known data is already on screen.
    }
  }

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

      {refreshNote && <p className="text-xs text-ink-muted mt-3">{refreshNote}</p>}

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
                  {refreshing.has(loc.userId) && <span className="ml-1.5 text-accent-strong">· Refreshing…</span>}
                </div>
                {/* Hourly background readings can be a stale network-cache fix, so they're labeled as
                    approximate rather than presented with the same confidence as a fresh on-demand one. */}
                {loc.source === "heartbeat" && !refreshing.has(loc.userId) && (
                  <div className="text-xs text-ink-muted mt-0.5">Approximate — from a background check.</div>
                )}
                {noResponse.has(loc.userId) && !refreshing.has(loc.userId) && (
                  <div className="text-xs text-ink-muted mt-0.5">Couldn&apos;t reach their phone just now — showing the last known position.</div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => startRefresh(loc.userId)}
                  disabled={refreshing.has(loc.userId)}
                  className="text-xs text-ink-muted underline disabled:opacity-50"
                >
                  Refresh
                </button>
                {isSuperAdmin && (
                  <button type="button" onClick={() => handleViewHistory(loc.userId)} className="text-xs text-ink-muted underline">
                    {openHistoryFor === loc.userId ? "Hide history" : "View 7-day history"}
                  </button>
                )}
              </div>
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
