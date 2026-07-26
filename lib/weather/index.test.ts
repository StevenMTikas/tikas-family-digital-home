import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The module keeps its cache as private module-level state (no reset
// export) — vi.resetModules() + a fresh dynamic import per test gives each
// test its own clean cache instead of leaking across tests.
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current: { temperature_2m: 72.4, weather_code: 0 } }),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WEATHER_LATITUDE;
  delete process.env.WEATHER_LONGITUDE;
});

describe("getWeather", () => {
  it("fetches and rounds the temperature, mapping the WMO weather code to a label", async () => {
    const { getWeather } = await import("./index");
    const snapshot = await getWeather();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.temperatureF).toBe(72);
    expect(snapshot!.condition).toBe("Clear");
  });

  it("uses a placeholder location when WEATHER_LATITUDE/LONGITUDE aren't set, rather than failing outright", async () => {
    delete process.env.WEATHER_LATITUDE;
    delete process.env.WEATHER_LONGITUDE;
    const { getWeather } = await import("./index");
    const snapshot = await getWeather();
    expect(snapshot).not.toBeNull();

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("latitude=40.7128");
    expect(calledUrl).toContain("longitude=-74.0060");
  });

  it("uses configured coordinates when set", async () => {
    process.env.WEATHER_LATITUDE = "51.5";
    process.env.WEATHER_LONGITUDE = "-0.12";
    const { getWeather } = await import("./index");
    await getWeather();

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain("latitude=51.5");
    expect(calledUrl).toContain("longitude=-0.12");
  });

  it("caches — a second call within the cache window does not refetch", async () => {
    const { getWeather } = await import("./index");
    await getWeather();
    await getWeather();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null (not a throw) when the very first fetch fails and there's no cache yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { getWeather } = await import("./index");
    await expect(getWeather()).resolves.toBeNull();
  });

  it("falls back to the last good cached snapshot if a later fetch fails", async () => {
    const { getWeather } = await import("./index");
    const first = await getWeather();
    expect(first).not.toBeNull();

    // Force the cache to look stale so the next call actually attempts a refetch.
    vi.useFakeTimers();
    vi.advanceTimersByTime(61 * 60 * 1000);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const second = await getWeather();
    expect(second).toEqual(first);
    vi.useRealTimers();
  });
});
