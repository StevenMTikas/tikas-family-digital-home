// Thin typed API client for Administration — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section. Covers every tab except
// Overview, whose initial data is fetched server-side directly (see
// app/administration/page.tsx) since it's the tab shown on first load.

import type { Role } from "@/lib/core/permissions/types";

export class AdminApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new AdminApiError(body?.error?.message ?? "Request failed.");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Overview (client-side refresh after an action elsewhere) ──────────
export interface OverviewData {
  urgentNotifications: { id: string; text: string; createdAt: string }[];
  passiveNotifications: { id: string; text: string; createdAt: string }[];
  health: HealthSnapshot;
  checkedAt: string | null;
}

export async function fetchOverview(): Promise<OverviewData> {
  return unwrap(await fetch("/api/admin/overview"));
}

// ── Monitoring ──────────────────────────────────────────────────────
export interface HealthSnapshot {
  diskSpace: { status: "ok" | "urgent"; freeRatio: number | null };
  deviceConnectivity: { status: "ok" | "issue"; staleDeviceCount: number };
  backup: { status: "ok" | "issue" | "unknown"; lastBackupAt: string | null; lastBackupStatus: "success" | "failed" | null };
}

export async function fetchMonitoring(): Promise<{ checkedAt: string | null; health: HealthSnapshot }> {
  return unwrap(await fetch("/api/admin/monitoring"));
}

// ── Folder Permissions ─────────────────────────────────────────────
export type FolderAccessLevel = "view" | "edit" | "delete";
export interface FolderPermissionGrants {
  users?: Partial<Record<string, FolderAccessLevel>>;
  roles?: Partial<Record<Role, FolderAccessLevel>>;
}
export interface FolderInfo {
  id: string;
  name: string;
  parentFolderId: string | null;
  isSharedFamilyFolder: boolean;
  inheritsPermissions: boolean;
  ownPermissions: FolderPermissionGrants | null;
  effectivePermissions: FolderPermissionGrants | null;
}

export async function fetchFolders(): Promise<FolderInfo[]> {
  return unwrap(await fetch("/api/admin/folders"));
}

export async function updateFolderPermissions(folderId: string, permissions: FolderPermissionGrants | null): Promise<FolderInfo> {
  return unwrap(
    await fetch(`/api/admin/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    })
  );
}

export async function setFolderInheritance(folderId: string, inheritsPermissions: boolean): Promise<FolderInfo> {
  return unwrap(
    await fetch(`/api/admin/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inheritsPermissions }),
    })
  );
}

// ── Logs ────────────────────────────────────────────────────────────
export interface LogEntry {
  id: string;
  type: string;
  userId: string | null;
  userName: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export async function fetchLogs(filters: { type?: string; userId?: string }): Promise<LogEntry[]> {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.userId) params.set("userId", filters.userId);
  const qs = params.toString();
  return unwrap(await fetch(`/api/admin/logs${qs ? `?${qs}` : ""}`));
}

// ── Backup ──────────────────────────────────────────────────────────
export interface BackupInfo {
  id: string;
  createdAt: string;
  status: "success" | "failed";
  sizeBytes: number;
  error?: string;
}

export async function fetchBackups(): Promise<BackupInfo[]> {
  return unwrap(await fetch("/api/admin/backup"));
}

export async function triggerBackup(): Promise<BackupInfo> {
  return unwrap(await fetch("/api/admin/backup", { method: "POST" }));
}

export async function restoreBackup(backupId: string): Promise<void> {
  await unwrap(
    await fetch("/api/admin/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupId }),
    })
  );
}

// ── Internet Access ─────────────────────────────────────────────────
export interface PermissionHolder {
  id: string;
  fullName: string;
  approveOutsideCalls: boolean;
  approveSensitiveOutsideTransmission: boolean;
}
export interface StandingConnection {
  id: string;
  userId: string;
  userName: string;
  provider: string;
  emailAddress: string;
  connectedAt: string;
}
export interface OutsideCallActivity {
  id: string;
  type: string;
  userId: string | null;
  userName: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}
export interface InternetAccessData {
  permissionHolders: PermissionHolder[];
  connections: StandingConnection[];
  recentActivity: OutsideCallActivity[];
}

export async function fetchInternetAccess(): Promise<InternetAccessData> {
  return unwrap(await fetch("/api/admin/internet-access"));
}

export async function revokeUserPermission(
  userId: string,
  permission: "approveOutsideCalls" | "approveSensitiveOutsideTransmission"
): Promise<void> {
  await unwrap(
    await fetch(`/api/admin/internet-access/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission }),
    })
  );
}

export async function revokeConnection(connectionId: string): Promise<void> {
  await unwrap(await fetch(`/api/admin/internet-access/connections/${connectionId}`, { method: "PATCH" }));
}

// ── Devices ─────────────────────────────────────────────────────────
export type FolderType = "camera_photos" | "documents";
export interface DeviceInfo {
  id: string;
  userId: string;
  userName: string;
  deviceType: "computer" | "phone";
  deviceName: string;
  status: "trusted" | "revoked";
  connectorEnabled: boolean;
  designatedFolders: FolderType[];
  lastSyncAt: string | null;
  addedAt: string;
  isHostDevice: boolean;
}
export interface DeviceWithToken extends DeviceInfo {
  authToken: string;
}

export interface WatchedFolderPath {
  id: string;
  folderType: FolderType;
  path: string;
  addedAt: string;
  lastScanStatus: "ok" | "not_found" | null;
  lastScanAt: string | null;
}

export async function fetchDevices(): Promise<DeviceInfo[]> {
  return unwrap(await fetch("/api/admin/devices"));
}

export async function addDevice(input: {
  userId: string;
  deviceType: "computer" | "phone";
  deviceName: string;
  designatedFolders: FolderType[];
}): Promise<DeviceInfo | DeviceWithToken> {
  return unwrap(
    await fetch("/api/admin/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function revokeDevice(id: string): Promise<DeviceInfo> {
  return unwrap(
    await fetch(`/api/admin/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "revoked" }),
    })
  );
}

export async function updateDeviceFolders(id: string, designatedFolders: FolderType[]): Promise<DeviceInfo | DeviceWithToken> {
  return unwrap(
    await fetch(`/api/admin/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designatedFolders }),
    })
  );
}

export async function regenerateDeviceToken(id: string): Promise<DeviceWithToken> {
  return unwrap(
    await fetch(`/api/admin/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerateToken: true }),
    })
  ) as Promise<DeviceWithToken>;
}

export async function fetchDeviceFolders(deviceId: string): Promise<WatchedFolderPath[]> {
  return unwrap(await fetch(`/api/admin/devices/${deviceId}/folders`));
}

export async function addDeviceFolder(deviceId: string, folderType: FolderType, path: string): Promise<WatchedFolderPath> {
  return unwrap(
    await fetch(`/api/admin/devices/${deviceId}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderType, path }),
    })
  );
}

export async function removeDeviceFolder(deviceId: string, folderId: string): Promise<void> {
  await unwrap(await fetch(`/api/admin/devices/${deviceId}/folders/${folderId}`, { method: "DELETE" }));
}

// ── External Viewers ───────────────────────────────────────────────
export interface ExternalViewerInfo {
  id: string;
  username: string;
  fullName: string;
  boardAccess: boolean;
  createdAt: string;
}

export async function fetchExternalViewers(): Promise<ExternalViewerInfo[]> {
  return unwrap(await fetch("/api/admin/external-viewers"));
}

export async function inviteExternalViewer(input: {
  fullName: string;
  username: string;
  password: string;
  boardAccess: boolean;
}): Promise<ExternalViewerInfo> {
  return unwrap(
    await fetch("/api/admin/external-viewers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function updateExternalViewer(
  id: string,
  patch: { boardAccess?: boolean; fullName?: string; newPassword?: string }
): Promise<ExternalViewerInfo> {
  return unwrap(
    await fetch(`/api/admin/external-viewers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  );
}

export async function deleteExternalViewer(id: string): Promise<void> {
  await unwrap(await fetch(`/api/admin/external-viewers/${id}`, { method: "DELETE" }));
}
