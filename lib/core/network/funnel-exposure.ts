// The one place that says which URL paths may ever be reachable from the open
// internet. Tailscale Funnel exposes a hostname:port, and `tailscale serve`
// decides which paths that port forwards — so the real boundary is that
// config, which lives outside this codebase. This allowlist is the in-repo
// record of what it is supposed to contain, checked two ways:
//   - a test asserting no sensitive route (location, connectors) sits under
//     an allowed prefix (funnel-exposure.test.ts), and
//   - scripts/scheduler-hourly.ts comparing the live `tailscale serve`
//     config against it, so drift (someone mounting "/" on the Funnel port)
//     is noticed rather than silently becoming public.
// See Decision_Log.md #008 and Security_Architecture.md's External Family
// Viewer Access section. Changing this list is a deliberate security decision.

export const FUNNEL_EXPOSED_PATHS = ["/_next", "/api/family-board", "/api/family-view", "/api/photos", "/family-view"] as const;

interface ServeStatus {
  Web?: Record<string, { Handlers?: Record<string, unknown> }>;
  AllowFunnel?: Record<string, boolean>;
}

export interface FunnelDrift {
  hostPort: string;
  path: string;
}

/** Every path mounted on a Funnel-enabled listener that isn't on the allowlist. Pure, for testing. */
export function findUnexpectedFunnelPaths(status: ServeStatus): FunnelDrift[] {
  const allowed = new Set<string>(FUNNEL_EXPOSED_PATHS);
  const drift: FunnelDrift[] = [];
  for (const [hostPort, enabled] of Object.entries(status.AllowFunnel ?? {})) {
    if (!enabled) continue;
    for (const path of Object.keys(status.Web?.[hostPort]?.Handlers ?? {})) {
      if (!allowed.has(path)) drift.push({ hostPort, path });
    }
  }
  return drift;
}
