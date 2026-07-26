// Thin typed API client for Administration — see Application_Architecture.md's
// "Frontend ↔ Backend Communication" section. Covers every tab except
// Overview, whose initial data is fetched server-side directly (see
// app/administration/page.tsx) since it's the tab shown on first load.

export class AdminApiError extends Error {}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new AdminApiError(body?.error?.message ?? "Request failed.");
  }
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
  roles?: Partial<Record<"super_admin" | "admin" | "basic_user", FolderAccessLevel>>;
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
