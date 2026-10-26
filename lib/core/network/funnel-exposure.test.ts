import { describe, it, expect } from "vitest";
import { FUNNEL_EXPOSED_PATHS, findUnexpectedFunnelPaths } from "./funnel-exposure";

// Sensitive surfaces that must stay tailnet-only (Location_Tracking.md,
// File_Connector_Architecture.md). If one of these ever lands under a Funnel
// prefix — by adding a prefix, or by moving a route — this fails.
const TAILNET_ONLY_ROUTES = [
  "/location",
  "/api/location",
  "/api/location/history",
  "/api/location/settings",
  "/api/connectors/location",
  "/api/connectors/sync",
  "/api/connectors/file",
  "/administration",
  "/api/admin",
];

function isUnder(route: string, prefix: string): boolean {
  return route === prefix || route.startsWith(`${prefix}/`);
}

describe("Funnel exposure allowlist", () => {
  it("keeps every tailnet-only route out of the Funnel-exposed prefixes", () => {
    for (const route of TAILNET_ONLY_ROUTES) {
      for (const prefix of FUNNEL_EXPOSED_PATHS) {
        expect(isUnder(route, prefix), `${route} would be exposed by ${prefix}`).toBe(false);
      }
    }
  });
});

describe("findUnexpectedFunnelPaths", () => {
  const host = "node.example.ts.net:8443";

  it("reports nothing when a Funnel listener mounts only allowlisted paths", () => {
    const handlers = Object.fromEntries(FUNNEL_EXPOSED_PATHS.map((p) => [p, {}]));
    expect(findUnexpectedFunnelPaths({ Web: { [host]: { Handlers: handlers } }, AllowFunnel: { [host]: true } })).toEqual([]);
  });

  it("flags the whole app being mounted on a Funnel listener", () => {
    expect(findUnexpectedFunnelPaths({ Web: { [host]: { Handlers: { "/": {} } } }, AllowFunnel: { [host]: true } })).toEqual([
      { hostPort: host, path: "/" },
    ]);
  });

  it("flags a location route being added to the Funnel listener", () => {
    const drift = findUnexpectedFunnelPaths({
      Web: { [host]: { Handlers: { "/family-view": {}, "/api/location": {} } } },
      AllowFunnel: { [host]: true },
    });
    expect(drift).toEqual([{ hostPort: host, path: "/api/location" }]);
  });

  it("ignores listeners that aren't Funnel-enabled (tailnet-only mounts of '/' are expected)", () => {
    const tailnet = "node.example.ts.net:443";
    expect(findUnexpectedFunnelPaths({ Web: { [tailnet]: { Handlers: { "/": {} } } }, AllowFunnel: { [host]: true } })).toEqual([]);
    expect(findUnexpectedFunnelPaths({ Web: { [tailnet]: { Handlers: { "/": {} } } } })).toEqual([]);
  });
});
