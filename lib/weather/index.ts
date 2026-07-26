// Weather widget backing — Dashboard.md: a Standing Integration Connection
// (Security_Architecture.md), set up once at the system level rather than
// per-user, refreshed automatically with no outside-call approval prompt.
// Open-Meteo needs no API key. Not persisted as family data — an in-memory,
// process-lifetime cache is enough to avoid hammering the API on every
// Dashboard load, per Dashboard.md's "refreshed hourly, not stored as a
// lasting record."

export interface WeatherSnapshot {
  temperatureF: number;
  condition: string;
  fetchedAt: string;
}

const CACHE_MS = 60 * 60 * 1000; // hourly, per Dashboard.md
// Arbitrary placeholder (New York City) if WEATHER_LATITUDE/LONGITUDE aren't
// set — .env.example: "leave blank to fall back to a placeholder location
// rather than fail outright."
const PLACEHOLDER_LATITUDE = "40.7128";
const PLACEHOLDER_LONGITUDE = "-74.0060";

let cached: WeatherSnapshot | null = null;
let cachedAt = 0;

function describeWeatherCode(code: number): string {
  // Simplified grouping of Open-Meteo's WMO weather codes.
  if (code === 0) return "Clear";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rainy";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snowy";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Unknown";
}

/** Returns the last-cached snapshot immediately if it's still fresh, otherwise fetches a new one. Returns null only if there's no cache yet and the fetch itself fails. */
export async function getWeather(): Promise<WeatherSnapshot | null> {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;

  const latitude = process.env.WEATHER_LATITUDE || PLACEHOLDER_LATITUDE;
  const longitude = process.env.WEATHER_LONGITUDE || PLACEHOLDER_LONGITUDE;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`
    );
    if (!res.ok) return cached;

    const data = (await res.json()) as { current: { temperature_2m: number; weather_code: number } };
    cached = {
      temperatureF: Math.round(data.current.temperature_2m),
      condition: describeWeatherCode(data.current.weather_code),
      fetchedAt: new Date().toISOString(),
    };
    cachedAt = Date.now();
    return cached;
  } catch (err) {
    console.error("[weather] Fetch failed:", err);
    return cached;
  }
}
