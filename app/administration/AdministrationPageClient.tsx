"use client";

// Administration hub: tab switching + all six Super Admin screens. Recreated
// from the design handoff (Tikas Administration.dc.html) — the shared
// sidebar/top-bar chrome shown there isn't built yet (Navigation.md's shell
// is Phase 7), so this renders as a standalone page like the other modules.
//
// Overview's initial data comes from the server (see page.tsx); every other
// tab fetches its own data client-side on first selection.

import { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
import * as adminApi from "@/lib/api/admin";
import type {
  HealthSnapshot,
  FolderInfo,
  FolderAccessLevel,
  LogEntry,
  BackupInfo,
  PermissionHolder,
  StandingConnection,
  OutsideCallActivity,
  DeviceInfo,
  DeviceWithToken,
  FolderType,
  WatchedFolderPath,
  ExternalViewerInfo,
} from "@/lib/api/admin";

export interface OverviewData {
  urgentNotifications: { id: string; text: string; createdAt: string }[];
  passiveNotifications: { id: string; text: string; createdAt: string }[];
  health: HealthSnapshot;
  checkedAt: string | null;
}

export interface FamilyMemberOption {
  id: string;
  fullName: string;
}

type Tab = "overview" | "monitoring" | "folders" | "logs" | "backup" | "internet" | "devices" | "external-viewers";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "monitoring", label: "Monitoring" },
  { id: "devices", label: "Devices" },
  { id: "folders", label: "Folder Permissions" },
  { id: "logs", label: "Logs" },
  { id: "backup", label: "Backup" },
  { id: "internet", label: "Internet Access" },
  { id: "external-viewers", label: "External Viewers" },
];

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdministrationPageClient({
  initialOverview,
  familyMembers,
}: {
  initialOverview: OverviewData;
  familyMembers: FamilyMemberOption[];
}) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <main className="p-6 max-w-[1000px]">
      <h1 className="font-display text-2xl font-medium">Administration</h1>

      <div className="flex gap-6 mt-4 border-b border-ink/10 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`pb-3 text-[13.5px] font-semibold border-b-2 whitespace-nowrap ${
              tab === t.id ? "text-ink border-accent" : "text-ink-muted border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-7">
        {tab === "overview" && <OverviewTab initial={initialOverview} onViewShortcut={setTab} />}
        {tab === "monitoring" && <MonitoringTab />}
        {tab === "devices" && <DevicesTab familyMembers={familyMembers} />}
        {tab === "folders" && <FolderPermissionsTab familyMembers={familyMembers} />}
        {tab === "logs" && <LogsTab familyMembers={familyMembers} />}
        {tab === "backup" && <BackupTab />}
        {tab === "internet" && <InternetAccessTab onViewLogs={() => setTab("logs")} />}
        {tab === "external-viewers" && <ExternalViewersTab onViewFolders={() => setTab("folders")} />}
      </div>
    </main>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────

function statusColor(status: string): string {
  if (status === "ok" || status === "success") return "text-calm bg-calm/[0.14]";
  if (status === "urgent" || status === "issue" || status === "failed") return "text-urgent bg-urgent/[0.14]";
  return "text-ink-muted bg-ink/[0.06]";
}

function HealthCard({ label, status, detail }: { label: string; status: string; detail: string }) {
  return (
    <div className="bg-surface rounded-2xl p-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{label}</div>
        <div className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${statusColor(status)}`}>
          {status === "ok" ? "OK" : status === "unknown" ? "Unknown" : status === "urgent" ? "Urgent" : "Issue"}
        </div>
      </div>
      <div className="text-[13px] text-ink">{detail}</div>
    </div>
  );
}

function healthCards(health: HealthSnapshot) {
  return (
    <>
      <HealthCard
        label="Disk Space"
        status={health.diskSpace.status}
        detail={health.diskSpace.freeRatio !== null ? `${(health.diskSpace.freeRatio * 100).toFixed(1)}% free` : "Unavailable"}
      />
      <HealthCard
        label="Device Connectivity"
        status={health.deviceConnectivity.status}
        detail={
          health.deviceConnectivity.staleDeviceCount === 0
            ? "All devices syncing normally"
            : `${health.deviceConnectivity.staleDeviceCount} device${health.deviceConnectivity.staleDeviceCount === 1 ? "" : "s"} haven't synced in a while`
        }
      />
      <HealthCard
        label="Backup"
        status={health.backup.status}
        detail={
          health.backup.lastBackupAt
            ? `Last: ${formatTimestamp(health.backup.lastBackupAt)} (${health.backup.lastBackupStatus})`
            : "No backup has run yet"
        }
      />
      {/* No separate "Connector Sync" card — Device Connectivity above already
          covers every row in the devices table (connectors included, per
          checkStaleDevices' unfiltered device_type query), so a second card
          here was pure duplication showing a stale "not built yet" claim
          left over from before Phase 5 actually built connectors. */}
    </>
  );
}

// ── Overview ────────────────────────────────────────────────────────

function OverviewTab({ initial, onViewShortcut }: { initial: OverviewData; onViewShortcut: (tab: Tab) => void }) {
  const [data] = useState(initial);

  return (
    <div className="flex flex-col gap-6">
      {data.urgentNotifications.length > 0 && (
        <div className="bg-urgent/[0.1] border border-urgent/30 rounded-2xl p-5">
          <div className="text-xs font-semibold text-urgent uppercase tracking-wide mb-2">Urgent</div>
          <div className="flex flex-col gap-2">
            {data.urgentNotifications.map((n) => (
              <div key={n.id} className="text-[13.5px] text-ink">
                {n.text}
                <span className="text-[11px] text-ink-muted ml-2">{formatTimestamp(n.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">System Health</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{healthCards(data.health)}</div>
        <div className="text-[11px] text-ink-muted mt-2">
          Last checked: {formatTimestamp(data.checkedAt)}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Notifications</div>
        {data.passiveNotifications.length === 0 ? (
          <p className="text-[13px] text-ink-muted">Nothing to report.</p>
        ) : (
          <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
            {data.passiveNotifications.map((n, i) => (
              <div key={n.id} className={`flex justify-between gap-4 py-3 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
                <span className="text-[13px] text-ink">{n.text}</span>
                <span className="text-[11px] text-ink-muted whitespace-nowrap">{formatTimestamp(n.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Shortcuts</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {TABS.filter((t) => t.id !== "overview").map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onViewShortcut(t.id)}
              className="bg-surface rounded-2xl p-4 text-left text-[13px] font-semibold text-ink shadow-[0_8px_20px_rgba(58,52,44,0.05)] hover:bg-ink/[0.02]"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Monitoring ──────────────────────────────────────────────────────

function MonitoringTab() {
  const [data, setData] = useState<{ checkedAt: string | null; health: HealthSnapshot } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.fetchMonitoring().then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-[13px] text-urgent">{error}</p>;
  if (!data) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  return (
    <div>
      <div className="bg-ink/[0.04] rounded-2xl px-5 py-3 text-[13px] text-ink mb-5">
        Last checked: <span className="font-semibold">{formatTimestamp(data.checkedAt)}</span> — Guardian runs this
        check once daily.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{healthCards(data.health)}</div>
    </div>
  );
}

// ── Devices ─────────────────────────────────────────────────────────

const FOLDER_TYPE_LABELS: Record<FolderType, string> = {
  camera_photos: "Camera / Photos",
  documents: "Downloaded Documents",
};

/** True for an address only the host machine itself can reach — a QR code built from one would fail on the phone. */
function isLoopbackUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
  } catch {
    return false;
  }
}

function TokenReveal({ device, onDismiss }: { device: DeviceWithToken; onDismiss: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      .writeText(`DEVICE_ID=${device.id}\nDEVICE_TOKEN=${device.authToken}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  // The phone scans this and calls it over the home network, so it must be an
  // address the *phone* can reach. Whatever this admin screen happens to be
  // open on is only a starting guess — if the Super Admin is setting this up
  // on the host machine itself it'll be localhost, which would pair a phone
  // that then silently fails every sync.
  const [hostUrl, setHostUrl] = useState("");

  useEffect(() => {
    setHostUrl(window.location.origin);
  }, []);

  // This panel renders at the top of the Devices tab, but "Regenerate Token" /
  // "Add Device" are usually clicked further down the page — without this it
  // looks like the click did nothing (a real confusion on 2026-10-25). Keyed to
  // the token so regenerating again while the panel is already open scrolls too.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [device.authToken]);

  useEffect(() => {
    if (device.deviceType !== "phone" || !hostUrl) return;
    const payload = JSON.stringify({
      hostUrl: hostUrl.replace(/\/+$/, ""),
      deviceId: device.id,
      deviceToken: device.authToken,
    });
    QRCode.toDataURL(payload, { width: 220, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [device, hostUrl]);

  return (
    <div ref={panelRef} className="bg-trust/10 border border-trust/30 rounded-2xl p-5 mb-5 scroll-mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-trust uppercase tracking-wide">
          Pairing token for {device.deviceName} — shown once
        </div>
        <button type="button" onClick={onDismiss} className="text-[11px] text-ink-muted">
          Dismiss
        </button>
      </div>

      {device.deviceType === "phone" ? (
        <>
          <p className="text-[12.5px] text-ink mb-3">
            Open the Tikas Connector app on {device.deviceName} and scan this code to pair it. It won&apos;t be
            shown again — use &quot;Regenerate Token&quot; below if it&apos;s lost.
          </p>

          <label className="block text-xs font-semibold text-ink mb-1.5">Address the phone should connect to</label>
          <input
            type="text"
            value={hostUrl}
            onChange={(e) => setHostUrl(e.target.value)}
            placeholder="http://192.168.1.20:3000"
            className="w-full max-w-[320px] px-3 py-2 rounded-xl border border-ink/15 text-[13px] font-mono text-ink mb-1.5"
          />
          {isLoopbackUrl(hostUrl) ? (
            <p className="text-[11.5px] text-urgent mb-3">
              This is a localhost address, which only works on this computer — a phone scanning it won&apos;t be able
              to reach the app. Replace it with this computer&apos;s address on your home network (for example
              <span className="font-mono"> http://192.168.1.20:3000</span>) before scanning.
            </p>
          ) : (
            <p className="text-[11px] text-ink-muted mb-3">
              The QR code below encodes this address. It must be reachable from the phone on your home network.
            </p>
          )}

          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={`Pairing QR code for ${device.deviceName}`} className="rounded-xl bg-white p-2" width={220} height={220} />
          )}
        </>
      ) : (
        <p className="text-[12.5px] text-ink mb-3">
          Copy this device id and token into the connector script&apos;s config on {device.deviceName}. It won&apos;t
          be shown again — use &quot;Regenerate Token&quot; below if it&apos;s lost.
        </p>
      )}

      <div className="relative font-mono text-[12px] bg-surface rounded-xl p-3 pr-16 break-all mt-3">
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy device id and token"
          className="absolute top-2 right-2 px-2 py-1 rounded-lg text-[11px] font-sans font-semibold text-trust bg-trust/10 hover:bg-trust/20"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <div>
          <span className="text-ink-muted">DEVICE_ID=</span>
          {device.id}
        </div>
        <div>
          <span className="text-ink-muted">DEVICE_TOKEN=</span>
          {device.authToken}
        </div>
      </div>
    </div>
  );
}

function DevicesTab({ familyMembers }: { familyMembers: FamilyMemberOption[] }) {
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<DeviceWithToken | null>(null);

  const [userId, setUserId] = useState("");
  const [deviceType, setDeviceType] = useState<"computer" | "phone">("computer");
  const [deviceName, setDeviceName] = useState("");
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [saving, setSaving] = useState(false);

  // Watched folder *paths* per device (distinct from the folder-*type*
  // checkboxes above, which already existed) — keyed by device id.
  const [folderPaths, setFolderPaths] = useState<Record<string, WatchedFolderPath[]>>({});
  const [newPath, setNewPath] = useState<Record<string, string>>({});
  const [newPathType, setNewPathType] = useState<Record<string, FolderType>>({});

  const load = useCallback(() => {
    adminApi
      .fetchDevices()
      .then((list) => {
        setDevices(list);
        Promise.all(
          list.map((d) => adminApi.fetchDeviceFolders(d.id).then((paths) => [d.id, paths] as const))
        ).then((pairs) => setFolderPaths(Object.fromEntries(pairs)));
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddFolderPath(deviceId: string) {
    const path = (newPath[deviceId] ?? "").trim();
    const folderType = newPathType[deviceId] ?? "documents";
    if (!path) return;
    await adminApi.addDeviceFolder(deviceId, folderType, path);
    setNewPath((prev) => ({ ...prev, [deviceId]: "" }));
    load();
  }

  async function handleRemoveFolderPath(deviceId: string, folderId: string) {
    await adminApi.removeDeviceFolder(deviceId, folderId);
    load();
  }

  function toggleFolder(f: FolderType) {
    setFolders((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  async function handleAdd() {
    if (!userId || !deviceName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await adminApi.addDevice({
        userId,
        deviceType,
        deviceName: deviceName.trim(),
        designatedFolders: folders,
      });
      if ("authToken" in result) setRevealedToken(result);
      setDeviceName("");
      setFolders([]);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add device.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string) {
    await adminApi.revokeDevice(id);
    load();
  }

  async function handleToggleDeviceFolder(device: DeviceInfo, f: FolderType) {
    const next = device.designatedFolders.includes(f)
      ? device.designatedFolders.filter((x) => x !== f)
      : [...device.designatedFolders, f];
    const result = await adminApi.updateDeviceFolders(device.id, next);
    if ("authToken" in result) setRevealedToken(result);
    load();
  }

  async function handleRegenerateToken(id: string) {
    const result = await adminApi.regenerateDeviceToken(id);
    setRevealedToken(result);
    load();
  }

  const nameById = new Map(familyMembers.map((m) => [m.id, m.fullName]));

  return (
    <div>
      {revealedToken && <TokenReveal device={revealedToken} onDismiss={() => setRevealedToken(null)} />}

      <div className="bg-surface rounded-2xl p-6 shadow-[0_8px_20px_rgba(58,52,44,0.05)] mb-6 max-w-[560px]">
        <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-4">Add Device</div>
        <div className="flex flex-col gap-3.5">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-ink mb-1.5">Family Member</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink"
              >
                <option value="">Select…</option>
                {familyMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-ink mb-1.5">Type</label>
              <select
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value as "computer" | "phone")}
                className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink"
              >
                <option value="computer">Computer</option>
                <option value="phone">Phone</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Device Name</label>
            <input
              type="text"
              placeholder="e.g. Vee's Laptop"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink placeholder:text-ink-muted/70"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Connector — designated folders (optional)
            </label>
            <div className="flex gap-4">
              {(
                (deviceType === "phone" ? ["camera_photos"] : Object.keys(FOLDER_TYPE_LABELS)) as FolderType[]
              ).map((f) => (
                <label key={f} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                  <input type="checkbox" checked={folders.includes(f)} onChange={() => toggleFolder(f)} />
                  {FOLDER_TYPE_LABELS[f]}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-ink-muted mt-1">
              {deviceType === "phone"
                ? "Checking Camera/Photos generates a pairing token and QR code below for the Tikas Connector app (Android only for now — documents sync isn't supported on phones yet). Leave unchecked to just keep a record of the phone (shown in their My Devices list)."
                : "Leave both unchecked to just keep a record of this device (shown in their My Devices list) without setting up a file connector. This doesn't affect whether they can log in — login only needs a username and password (see Authentication.md)."}
            </p>
          </div>
        </div>

        {error && <p className="text-[12px] text-urgent mt-3">{error}</p>}

        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !userId || !deviceName.trim()}
          className="mt-4 text-[13px] font-semibold text-white bg-accent-strong px-5 py-2.5 rounded-full disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add Device"}
        </button>
      </div>

      <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">All Devices</div>
      {!devices && <p className="text-[13px] text-ink-muted">Loading…</p>}
      {devices && devices.length === 0 && <p className="text-[13px] text-ink-muted">No devices yet.</p>}
      {devices && devices.length > 0 && (
        <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
          {devices.map((d, i) => (
            <div key={d.id} className={`py-3.5 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-[13.5px] text-ink">
                    {d.deviceName}{" "}
                    <span className="text-ink-muted">
                      · {d.isHostDevice ? "this server" : nameById.get(d.userId) ?? d.userName}
                    </span>
                  </div>
                  <div className="text-[11.5px] text-ink-muted mt-0.5">
                    {d.deviceType === "computer" ? "Computer" : "Phone"} ·{" "}
                    {d.connectorEnabled
                      ? `Syncing: ${d.designatedFolders.map((f) => FOLDER_TYPE_LABELS[f]).join(", ")}`
                      : "No connector"}{" "}
                    · Last sync: {formatTimestamp(d.lastSyncAt)}
                  </div>
                </div>
                <div
                  className={`text-[11px] px-3 py-1 rounded-full ${
                    d.status === "trusted" ? "text-calm bg-calm/[0.14]" : "text-urgent bg-urgent/[0.14]"
                  }`}
                >
                  {d.status === "trusted" ? "Trusted" : "Revoked"}
                </div>
                {d.status === "trusted" && !d.isHostDevice && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(d.id)}
                    className="text-[11.5px] font-semibold text-urgent border border-urgent/30 rounded-full px-3 py-1"
                  >
                    Revoke
                  </button>
                )}
              </div>

              {d.status === "trusted" && (
                <div className="flex items-center gap-4 mt-2 pl-0">
                  {(
                    (d.deviceType === "phone" ? ["camera_photos"] : Object.keys(FOLDER_TYPE_LABELS)) as FolderType[]
                  ).map((f) => (
                    <label key={f} className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                      <input type="checkbox" checked={d.designatedFolders.includes(f)} onChange={() => handleToggleDeviceFolder(d, f)} />
                      {FOLDER_TYPE_LABELS[f]}
                    </label>
                  ))}
                  {d.connectorEnabled && !d.isHostDevice && (
                    <button
                      type="button"
                      onClick={() => handleRegenerateToken(d.id)}
                      className="text-[11.5px] font-semibold text-accent-strong ml-auto"
                    >
                      Regenerate Token
                    </button>
                  )}
                </div>
              )}

              {d.status === "trusted" && (
                <div className="mt-2.5 pl-0 flex flex-col gap-2">
                  {(
                    (d.deviceType === "phone" ? ["camera_photos"] : Object.keys(FOLDER_TYPE_LABELS)) as FolderType[]
                  ).map((folderType) => {
                    const paths = (folderPaths[d.id] ?? []).filter((p) => p.folderType === folderType);
                    return (
                      <div key={folderType}>
                        <div className="text-[10.5px] font-semibold text-ink-muted uppercase tracking-wide mb-1">
                          {FOLDER_TYPE_LABELS[folderType]} folders
                        </div>
                        {paths.length === 0 ? (
                          <p className="text-[11.5px] text-ink-muted italic">None configured yet.</p>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {paths.map((p) => (
                              <div key={p.id} className="flex items-center gap-2 text-[11.5px]">
                                {p.lastScanStatus === "not_found" && (
                                  <span
                                    title={`Couldn't reach this folder as of ${formatTimestamp(p.lastScanAt)} — check the path is correct and the device is online.`}
                                    aria-label="Folder not found on last check"
                                    className="text-urgent"
                                  >
                                    ⚠
                                  </span>
                                )}
                                <span className="font-mono text-ink flex-1 break-all">{p.path}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFolderPath(d.id, p.id)}
                                  className="text-ink-muted hover:text-urgent"
                                  aria-label={`Remove folder ${p.path}`}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="flex items-center gap-2 mt-1">
                    <select
                      value={newPathType[d.id] ?? (d.deviceType === "phone" ? "camera_photos" : "documents")}
                      onChange={(e) => setNewPathType((prev) => ({ ...prev, [d.id]: e.target.value as FolderType }))}
                      className="px-2 py-1.5 rounded-lg border border-ink/15 text-[11.5px] text-ink"
                    >
                      {(
                        (d.deviceType === "phone" ? ["camera_photos"] : Object.keys(FOLDER_TYPE_LABELS)) as FolderType[]
                      ).map((f) => (
                        <option key={f} value={f}>
                          {FOLDER_TYPE_LABELS[f]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder={d.isHostDevice ? "e.g. C:\\Users\\YourName\\Documents" : "Exact path on that computer"}
                      value={newPath[d.id] ?? ""}
                      onChange={(e) => setNewPath((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-ink/15 text-[11.5px] font-mono text-ink placeholder:font-sans placeholder:text-ink-muted/70"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddFolderPath(d.id)}
                      disabled={!(newPath[d.id] ?? "").trim()}
                      className="text-[11.5px] font-semibold text-accent-strong disabled:opacity-50"
                    >
                      + Add folder
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Folder Permissions ──────────────────────────────────────────────

const ACCESS_LEVELS: FolderAccessLevel[] = ["view", "edit", "delete"];

function FolderPermissionsTab({ familyMembers }: { familyMembers: FamilyMemberOption[] }) {
  const [folders, setFolders] = useState<FolderInfo[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newGrantUserId, setNewGrantUserId] = useState("");
  const [newGrantLevel, setNewGrantLevel] = useState<FolderAccessLevel>("view");

  const load = useCallback(() => {
    adminApi
      .fetchFolders()
      .then((f) => {
        setFolders(f);
        setSelectedId((prev) => prev ?? f[0]?.id ?? null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-[13px] text-urgent">{error}</p>;
  if (!folders) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  const selected = folders.find((f) => f.id === selectedId) ?? null;
  const nameById = new Map(familyMembers.map((m) => [m.id, m.fullName]));

  async function addGrant() {
    if (!selected || !newGrantUserId) return;
    const current = selected.effectivePermissions ?? {};
    const updated = { ...current, users: { ...(current.users ?? {}), [newGrantUserId]: newGrantLevel } };
    await adminApi.updateFolderPermissions(selected.id, updated);
    setNewGrantUserId("");
    load();
  }

  async function removeGrant(userId: string) {
    if (!selected) return;
    const current = selected.effectivePermissions ?? {};
    const users = { ...(current.users ?? {}) };
    delete users[userId];
    await adminApi.updateFolderPermissions(selected.id, { ...current, users });
    load();
  }

  async function toggleOverride(next: boolean) {
    if (!selected) return;
    await adminApi.setFolderInheritance(selected.id, next);
    load();
  }

  const canEditGrants = !selected?.inheritsPermissions;

  return (
    <div className="flex gap-6">
      <div className="w-[240px] shrink-0 bg-surface rounded-2xl p-4 shadow-[0_8px_20px_rgba(58,52,44,0.05)] h-fit">
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelectedId(f.id)}
            className={`w-full text-left px-3 py-2 rounded-xl text-[13px] flex items-center justify-between ${
              f.id === selectedId ? "bg-accent/15 text-ink font-semibold" : "text-ink-muted hover:bg-ink/[0.04]"
            }`}
          >
            {f.name}
            {f.isSharedFamilyFolder && (
              <span className="text-[10px] text-trust bg-trust/10 px-2 py-0.5 rounded-full">Shared</span>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div className="flex-1 bg-surface rounded-2xl p-6 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-medium text-ink">{selected.name}</h2>
            <span
              className={`text-[11px] px-3 py-1 rounded-full ${
                selected.inheritsPermissions ? "text-ink-muted bg-ink/[0.06]" : "text-trust bg-trust/10"
              }`}
            >
              {selected.inheritsPermissions ? "Inheriting from parent" : "Override applied"}
            </span>
          </div>

          <div className="mb-5">
            <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
              Override Inheritance (Super Admin only)
            </div>
            {selected.parentFolderId ? (
              <button
                type="button"
                onClick={() => toggleOverride(!selected.inheritsPermissions)}
                className="text-[12.5px] font-semibold text-accent-strong border border-accent-strong/40 rounded-full px-4 py-1.5"
              >
                {selected.inheritsPermissions ? "Break Inheritance" : "Restore Inheritance"}
              </button>
            ) : (
              <p className="text-[12.5px] text-ink-muted">Not applicable — this is a top-level folder.</p>
            )}
          </div>

          <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
            Permissions {!canEditGrants && "(read-only while inheriting)"}
          </div>
          <div className="border border-ink/10 rounded-xl overflow-hidden mb-3">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2 bg-ink/[0.03] text-[11px] font-semibold text-ink-muted">
              <div>Who</div>
              <div>Level</div>
              <div></div>
            </div>
            {Object.entries(selected.effectivePermissions?.users ?? {}).length === 0 &&
            Object.entries(selected.effectivePermissions?.roles ?? {}).length === 0 ? (
              <div className="px-4 py-3 text-[13px] text-ink-muted">No grants yet.</div>
            ) : (
              <>
                {Object.entries(selected.effectivePermissions?.users ?? {}).map(([userId, level]) => (
                  <div key={userId} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 items-center border-t border-ink/[0.06]">
                    <div className="text-[13px] text-ink">{nameById.get(userId) ?? userId}</div>
                    <div className="text-[12px] text-ink-muted capitalize">{level}</div>
                    <button
                      type="button"
                      disabled={!canEditGrants}
                      onClick={() => removeGrant(userId)}
                      className="text-[11.5px] text-urgent disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {Object.entries(selected.effectivePermissions?.roles ?? {}).map(([role, level]) => (
                  <div key={role} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 items-center border-t border-ink/[0.06]">
                    <div className="text-[13px] text-ink capitalize">{role.replace("_", " ")} (role)</div>
                    <div className="text-[12px] text-ink-muted capitalize">{level}</div>
                    <div />
                  </div>
                ))}
              </>
            )}
          </div>

          {canEditGrants && (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Add grant for</label>
                <select
                  value={newGrantUserId}
                  onChange={(e) => setNewGrantUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink"
                >
                  <option value="">Select a family member…</option>
                  {familyMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">Level</label>
                <select
                  value={newGrantLevel}
                  onChange={(e) => setNewGrantLevel(e.target.value as FolderAccessLevel)}
                  className="px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink capitalize"
                >
                  {ACCESS_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={addGrant}
                disabled={!newGrantUserId}
                className="text-[12.5px] font-semibold text-white bg-accent-strong px-5 py-2 rounded-full disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Logs ────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  login_failed: "Failed Login",
  login_locked: "Login Locked",
  password_reset: "Password Reset",
  device_added: "Device Added",
  device_revoked: "Device Revoked",
  permission_changed: "Permission Change",
  outside_call_approved: "Outside Call Approved",
  outside_call_denied: "Outside Call Denied",
  outside_call_blocked: "Outside Call Blocked",
  ai_interaction: "AI Interaction",
  backup_restored: "Backup Restored",
  backup_failed: "Backup Failed",
  password_viewed: "Password Viewed",
  document_uploaded: "Document Uploaded",
  document_downloaded: "Document Downloaded",
  document_deleted: "Document Deleted",
  family_knowledge_item_deleted: "Family Knowledge Item Deleted",
  external_content_viewed: "External Viewer Activity",
};

function summarizeDetail(entry: LogEntry): string {
  const d = entry.detail;
  if (!d) return "—";
  if (entry.type === "permission_changed") {
    if (d.scope === "folder") return `Folder "${d.folderName}" permissions updated`;
    if (d.scope === "document" && d.action === "sensitivity_changed") return `Document sensitivity ${d.isSensitive ? "raised" : "lowered"}`;
    if (d.action === "revoked") return `Revoked ${d.permission} from ${d.targetUserName}`;
    if (d.action === "connection_revoked") return `Revoked connection: ${d.emailAddress}`;
    return "Permission updated";
  }
  if (entry.type === "ai_interaction") return `${d.agent} run`;
  if (entry.type === "backup_restored") return `Restored backup ${d.backupId}`;
  if (entry.type === "backup_failed") return `Backup failed: ${d.error}`;
  if (entry.type === "password_viewed") return `Viewed "${d.serviceName}"`;
  if (entry.type === "document_uploaded" || entry.type === "document_downloaded" || entry.type === "document_deleted") {
    return `"${d.title}"`;
  }
  if (entry.type === "family_knowledge_item_deleted") return `"${d.title}"`;
  if (entry.type === "external_content_viewed") return `Viewed ${d.surface}`;
  if ("payloadDescription" in d) return String(d.payloadDescription);
  return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(", ") || "—";
}

function LogsTab({ familyMembers }: { familyMembers: FamilyMemberOption[] }) {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .fetchLogs({ type: typeFilter || undefined, userId: userFilter || undefined })
      .then(setLogs)
      .catch((err) => setError(err.message));
  }, [typeFilter, userFilter]);

  return (
    <div>
      <div className="flex gap-3 mb-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink"
        >
          <option value="">All event types</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-ink/15 text-[13px] text-ink"
        >
          <option value="">All family members</option>
          {familyMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11.5px] text-ink-muted mb-4">Showing events from the last 30 days — older entries are purged automatically.</p>

      {error && <p className="text-[13px] text-urgent">{error}</p>}
      {!logs && !error && <p className="text-[13px] text-ink-muted">Loading…</p>}
      {logs && logs.length === 0 && <p className="text-[13px] text-ink-muted">No matching events.</p>}
      {logs && logs.length > 0 && (
        <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
          {logs.map((entry, i) => (
            <div key={entry.id} className={`flex items-center gap-4 py-3 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
              <div className="text-[11px] font-semibold text-trust bg-trust/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                {EVENT_TYPE_LABELS[entry.type] ?? entry.type}
              </div>
              <div className="text-[12.5px] text-ink-muted w-[110px] shrink-0">{entry.userName ?? "—"}</div>
              <div className="flex-1 text-[13px] text-ink truncate">{summarizeDetail(entry)}</div>
              <div className="text-[11px] text-ink-muted whitespace-nowrap">{formatTimestamp(entry.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Backup ──────────────────────────────────────────────────────────

function BackupTab() {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingRestoreId, setConfirmingRestoreId] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.fetchBackups().then(setBackups).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleBackupNow() {
    setBusy(true);
    setError(null);
    try {
      await adminApi.triggerBackup();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(id: string) {
    setBusy(true);
    setError(null);
    try {
      await adminApi.restoreBackup(id);
      setConfirmingRestoreId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  const last = backups?.[0] ?? null;

  return (
    <div className="flex gap-6">
      <div className="w-[260px] shrink-0 bg-surface rounded-2xl p-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)] h-fit">
        <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Last Backup</div>
        {last ? (
          <>
            <div className={`inline-block text-[11px] px-2.5 py-0.5 rounded-full font-semibold mb-2 ${statusColor(last.status)}`}>
              {last.status === "success" ? "Success" : "Failed"}
            </div>
            <div className="text-[13px] text-ink">{formatTimestamp(last.createdAt)}</div>
            <div className="text-[12px] text-ink-muted mt-0.5">{formatBytes(last.sizeBytes)}</div>
          </>
        ) : (
          <p className="text-[13px] text-ink-muted">No backup has run yet.</p>
        )}
        <p className="text-[11.5px] text-ink-muted mt-3">
          Automatic daily backups keep the last 7. Backups are stored locally and the database snapshot is encrypted.
        </p>

        {error && <p className="text-[12px] text-urgent mt-3">{error}</p>}

        <button
          type="button"
          onClick={handleBackupNow}
          disabled={busy}
          className="mt-4 w-full text-[13px] font-semibold text-white bg-accent-strong px-5 py-2.5 rounded-full disabled:opacity-70"
        >
          {busy ? "Working…" : "Back Up Now"}
        </button>
      </div>

      <div className="flex-1">
        <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Recent Backups</div>
        {!backups && <p className="text-[13px] text-ink-muted">Loading…</p>}
        {backups && backups.length === 0 && <p className="text-[13px] text-ink-muted">No backups yet.</p>}
        {backups && backups.length > 0 && (
          <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
            {backups.map((b, i) => (
              <div key={b.id} className={`py-3 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
                <div className="flex items-center gap-4">
                  <div className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${statusColor(b.status)}`}>
                    {b.status === "success" ? "Success" : "Failed"}
                  </div>
                  <div className="text-[13px] text-ink flex-1">{formatTimestamp(b.createdAt)}</div>
                  <div className="text-[12px] text-ink-muted">{formatBytes(b.sizeBytes)}</div>
                  {b.status === "success" && (
                    <button
                      type="button"
                      onClick={() => setConfirmingRestoreId(confirmingRestoreId === b.id ? null : b.id)}
                      className="text-[11.5px] font-semibold text-accent-strong"
                    >
                      Restore…
                    </button>
                  )}
                </div>
                {confirmingRestoreId === b.id && (
                  <div className="mt-2 bg-urgent/[0.08] border border-urgent/30 rounded-xl p-3">
                    <p className="text-[12.5px] text-ink mb-2">
                      This replaces the current database and uploaded files with this backup&apos;s contents. The
                      current state is saved aside first, but this cannot be casually undone. Continue?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRestore(b.id)}
                        className="text-[12px] font-semibold text-white bg-urgent px-3 py-1.5 rounded-full disabled:opacity-70"
                      >
                        {busy ? "Restoring…" : "Yes, restore"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingRestoreId(null)}
                        className="text-[12px] font-semibold text-ink-muted px-3 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Internet Access ─────────────────────────────────────────────────

function InternetAccessTab({ onViewLogs }: { onViewLogs: () => void }) {
  const [holders, setHolders] = useState<PermissionHolder[] | null>(null);
  const [connections, setConnections] = useState<StandingConnection[] | null>(null);
  const [activity, setActivity] = useState<OutsideCallActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi
      .fetchInternetAccess()
      .then((data) => {
        setHolders(data.permissionHolders);
        setConnections(data.connections);
        setActivity(data.recentActivity);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevokePermission(userId: string, permission: "approveOutsideCalls" | "approveSensitiveOutsideTransmission") {
    await adminApi.revokeUserPermission(userId, permission);
    load();
  }

  async function handleRevokeConnection(id: string) {
    await adminApi.revokeConnection(id);
    load();
  }

  if (error) return <p className="text-[13px] text-urgent">{error}</p>;

  return (
    <div className="flex flex-col gap-7">
      <div>
        <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Outside-Call Permission Holders</div>
        {!holders ? (
          <p className="text-[13px] text-ink-muted">Loading…</p>
        ) : holders.length === 0 ? (
          <p className="text-[13px] text-ink-muted">No one currently holds outside-call permissions.</p>
        ) : (
          <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
            {holders.map((h, i) => (
              <div key={h.id} className={`flex items-center gap-4 py-3 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
                <div className="text-[13px] text-ink flex-1">{h.fullName}</div>
                {h.approveOutsideCalls && (
                  <button
                    type="button"
                    onClick={() => handleRevokePermission(h.id, "approveOutsideCalls")}
                    className="text-[11.5px] font-semibold text-urgent border border-urgent/30 rounded-full px-3 py-1"
                  >
                    Revoke Approve Outside Calls
                  </button>
                )}
                {h.approveSensitiveOutsideTransmission && (
                  <button
                    type="button"
                    onClick={() => handleRevokePermission(h.id, "approveSensitiveOutsideTransmission")}
                    className="text-[11.5px] font-semibold text-urgent border border-urgent/30 rounded-full px-3 py-1"
                  >
                    Revoke Sensitive-Data Gate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Active Standing Integration Connections</div>
        {!connections ? (
          <p className="text-[13px] text-ink-muted">Loading…</p>
        ) : connections.length === 0 ? (
          <p className="text-[13px] text-ink-muted">
            No active connections. (Email accounts appear here once connected; the Weather connection isn&apos;t
            built yet.)
          </p>
        ) : (
          <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
            {connections.map((c, i) => (
              <div key={c.id} className={`flex items-center gap-4 py-3 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
                <div className="flex-1">
                  <div className="text-[13px] text-ink">{c.emailAddress}</div>
                  <div className="text-[11.5px] text-ink-muted">
                    {c.userName} · {c.provider} · connected {formatTimestamp(c.connectedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevokeConnection(c.id)}
                  className="text-[11.5px] font-semibold text-urgent border border-urgent/30 rounded-full px-3 py-1"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Recent Outside-Call Activity</div>
          <button type="button" onClick={onViewLogs} className="text-[12px] font-semibold text-accent-strong">
            View full log →
          </button>
        </div>
        {!activity ? (
          <p className="text-[13px] text-ink-muted">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="text-[13px] text-ink-muted">No outside-call activity yet.</p>
        ) : (
          <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
            {activity.map((a, i) => (
              <div key={a.id} className={`flex items-center gap-4 py-2.5 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
                <div className="text-[11px] font-semibold text-trust bg-trust/10 px-2.5 py-1 rounded-full whitespace-nowrap">
                  {EVENT_TYPE_LABELS[a.type] ?? a.type}
                </div>
                <div className="text-[12.5px] text-ink-muted w-[110px] shrink-0">{a.userName ?? "—"}</div>
                <div className="text-[11px] text-ink-muted ml-auto">{formatTimestamp(a.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── External Viewers ────────────────────────────────────────────────
// Parallel to Add User (app/users/UsersPageClient.tsx), not a 4th role
// option on that form — see app/api/admin/external-viewers/route.ts's
// header comment for why. Photos access is granted through the existing
// Folder Permissions tab, unchanged (a newly invited External Viewer
// already appears in that tab's grant-picker automatically).
function ExternalViewersTab({ onViewFolders }: { onViewFolders: () => void }) {
  const [viewers, setViewers] = useState<ExternalViewerInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [boardAccess, setBoardAccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPasswordDraft, setNewPasswordDraft] = useState("");

  const load = useCallback(() => {
    adminApi
      .fetchExternalViewers()
      .then(setViewers)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite() {
    if (!fullName.trim() || !username.trim() || !password) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.inviteExternalViewer({
        fullName: fullName.trim(),
        username: username.trim(),
        password,
        boardAccess,
      });
      setFullName("");
      setUsername("");
      setPassword("");
      setBoardAccess(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not invite External Viewer.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleBoardAccess(viewer: ExternalViewerInfo) {
    setBusyId(viewer.id);
    try {
      await adminApi.updateExternalViewer(viewer.id, { boardAccess: !viewer.boardAccess });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(id: string) {
    if (!newPasswordDraft) return;
    setBusyId(id);
    try {
      await adminApi.updateExternalViewer(id, { newPassword: newPasswordDraft });
      setResettingId(null);
      setNewPasswordDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await adminApi.deleteExternalViewer(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {error && <p className="text-[13px] text-urgent mb-4">{error}</p>}

      <div className="bg-surface rounded-2xl p-6 shadow-[0_8px_20px_rgba(58,52,44,0.05)] mb-6 max-w-[560px]">
        <div className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-4">Invite External Viewer</div>
        <div className="flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">Full Name</label>
            <input
              type="text"
              placeholder="e.g. Grandma Tikas"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink placeholder:text-ink-muted/70"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-ink mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-ink mb-1.5">Password</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-ink/15 text-[13.5px] font-body text-ink"
              />
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
            <input type="checkbox" checked={boardAccess} onChange={(e) => setBoardAccess(e.target.checked)} />
            Give access to the Family Board
          </label>
          <p className="text-[11px] text-ink-muted">
            Photos access is granted separately — after inviting, use the{" "}
            <button type="button" onClick={onViewFolders} className="font-semibold text-accent-strong">
              Folder Permissions tab
            </button>{" "}
            to grant this person View access to specific folders.
          </p>
          <button
            type="button"
            onClick={handleInvite}
            disabled={saving || !fullName.trim() || !username.trim() || !password}
            className="text-[13px] font-semibold text-white bg-accent-strong px-5 py-2.5 rounded-xl disabled:opacity-60"
          >
            {saving ? "Inviting…" : "Invite"}
          </button>
        </div>
      </div>

      {viewers === null ? (
        <p className="text-[13px] text-ink-muted">Loading…</p>
      ) : viewers.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No External Viewers yet.</p>
      ) : (
        <div className="bg-surface rounded-2xl px-5 shadow-[0_8px_20px_rgba(58,52,44,0.05)]">
          {viewers.map((v, i) => (
            <div key={v.id} className={`py-3 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">{v.fullName}</div>
                  <div className="text-[12px] text-ink-muted">@{v.username}</div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[12px] text-ink">
                    <input
                      type="checkbox"
                      checked={v.boardAccess}
                      disabled={busyId === v.id}
                      onChange={() => handleToggleBoardAccess(v)}
                    />
                    Family Board
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResettingId(resettingId === v.id ? null : v.id);
                      setNewPasswordDraft("");
                    }}
                    className="text-[12px] text-ink-muted underline"
                  >
                    Reset Password
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(v.id)}
                    disabled={busyId === v.id}
                    className="text-[12px] text-urgent disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {resettingId === v.id && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="New password"
                    value={newPasswordDraft}
                    onChange={(e) => setNewPasswordDraft(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-ink/15 text-[12.5px] text-ink"
                  />
                  <button
                    type="button"
                    onClick={() => handleResetPassword(v.id)}
                    disabled={busyId === v.id || !newPasswordDraft}
                    className="text-[12px] font-semibold text-accent-strong disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
