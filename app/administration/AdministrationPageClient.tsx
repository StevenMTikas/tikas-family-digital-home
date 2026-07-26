"use client";

// Administration hub: tab switching + all six Super Admin screens. Recreated
// from the design handoff (Tikas Administration.dc.html) — the shared
// sidebar/top-bar chrome shown there isn't built yet (Navigation.md's shell
// is Phase 7), so this renders as a standalone page like the other modules.
//
// Overview's initial data comes from the server (see page.tsx); every other
// tab fetches its own data client-side on first selection.

import { useState, useEffect, useCallback } from "react";
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

type Tab = "overview" | "monitoring" | "folders" | "logs" | "backup" | "internet" | "devices";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "monitoring", label: "Monitoring" },
  { id: "devices", label: "Devices" },
  { id: "folders", label: "Folder Permissions" },
  { id: "logs", label: "Logs" },
  { id: "backup", label: "Backup" },
  { id: "internet", label: "Internet Access" },
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

function TokenReveal({ device, onDismiss }: { device: DeviceWithToken; onDismiss: () => void }) {
  return (
    <div className="bg-trust/10 border border-trust/30 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-trust uppercase tracking-wide">
          Pairing token for {device.deviceName} — shown once
        </div>
        <button type="button" onClick={onDismiss} className="text-[11px] text-ink-muted">
          Dismiss
        </button>
      </div>
      <p className="text-[12.5px] text-ink mb-3">
        Copy this device id and token into the connector script&apos;s config on {device.deviceName}. It won&apos;t
        be shown again — use &quot;Regenerate Token&quot; below if it&apos;s lost.
      </p>
      <div className="font-mono text-[12px] bg-surface rounded-xl p-3 break-all">
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

  const load = useCallback(() => {
    adminApi.fetchDevices().then(setDevices).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
        designatedFolders: deviceType === "computer" ? folders : [],
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

          {deviceType === "computer" ? (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">
                Connector — designated folders (optional)
              </label>
              <div className="flex gap-4">
                {(Object.keys(FOLDER_TYPE_LABELS) as FolderType[]).map((f) => (
                  <label key={f} className="flex items-center gap-1.5 text-[12.5px] text-ink">
                    <input type="checkbox" checked={folders.includes(f)} onChange={() => toggleFolder(f)} />
                    {FOLDER_TYPE_LABELS[f]}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-ink-muted mt-1">
                Leave both unchecked to just keep a record of this device (shown in their My Devices list) without
                setting up a file connector. This doesn't affect whether they can log in — login only needs a
                username and password (see Authentication.md).
              </p>
            </div>
          ) : (
            <p className="text-[11.5px] text-ink-muted">
              Phone connectors aren&apos;t supported yet — this just keeps a record of the phone (shown in their My
              Devices list). See File_Connector_Architecture.md.
            </p>
          )}
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
                    {d.deviceName} <span className="text-ink-muted">· {nameById.get(d.userId) ?? d.userName}</span>
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
                {d.status === "trusted" && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(d.id)}
                    className="text-[11.5px] font-semibold text-urgent border border-urgent/30 rounded-full px-3 py-1"
                  >
                    Revoke
                  </button>
                )}
              </div>

              {d.status === "trusted" && d.deviceType === "computer" && (
                <div className="flex items-center gap-4 mt-2 pl-0">
                  {(Object.keys(FOLDER_TYPE_LABELS) as FolderType[]).map((f) => (
                    <label key={f} className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                      <input type="checkbox" checked={d.designatedFolders.includes(f)} onChange={() => handleToggleDeviceFolder(d, f)} />
                      {FOLDER_TYPE_LABELS[f]}
                    </label>
                  ))}
                  {d.connectorEnabled && (
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
                className="text-[12.5px] font-semibold text-white bg-accent-strong px-4 py-2 rounded-full disabled:opacity-50"
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
  login_failed: "Failed Login",
  password_reset: "Password Reset",
  device_added: "Device Added",
  device_revoked: "Device Revoked",
  permission_changed: "Permission Change",
  outside_call_approved: "Outside Call Approved",
  outside_call_denied: "Outside Call Denied",
  outside_call_blocked: "Outside Call Blocked",
  ai_interaction: "AI Interaction",
  backup_restored: "Backup Restored",
};

function summarizeDetail(entry: LogEntry): string {
  const d = entry.detail;
  if (!d) return "—";
  if (entry.type === "permission_changed") {
    if (d.scope === "folder") return `Folder "${d.folderName}" permissions updated`;
    if (d.action === "revoked") return `Revoked ${d.permission} from ${d.targetUserName}`;
    if (d.action === "connection_revoked") return `Revoked connection: ${d.emailAddress}`;
    return "Permission updated";
  }
  if (entry.type === "ai_interaction") return `${d.agent} run`;
  if (entry.type === "backup_restored") return `Restored backup ${d.backupId}`;
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
          className="mt-4 w-full text-[13px] font-semibold text-white bg-accent-strong px-4 py-2.5 rounded-full disabled:opacity-70"
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
