/**
 * Weather Guard — Open-Meteo forecast service
 *
 * Uses the free Open-Meteo API (no API key required).
 * Fetches hourly weather codes + wind speed for a given location
 * and determines which time slots should be blocked based on
 * the shop owner's Weather Guard settings.
 *
 * @see https://open-meteo.com/en/docs
 */

// ─── WMO Weather Code Classification ────────────────────────────────────────

const RAIN_CODES = new Set([
  51, 53, 55,   // Drizzle: light, moderate, dense
  61, 63, 65,   // Rain: slight, moderate, heavy
  80, 81, 82,   // Rain showers: slight, moderate, violent
]);

const SNOW_CODES = new Set([
  71, 73, 75,   // Snowfall: slight, moderate, heavy
  77,           // Snow grains
  85, 86,       // Snow showers: slight, heavy
]);

const THUNDERSTORM_CODES = new Set([
  95,           // Thunderstorm: slight or moderate
  96, 99,       // Thunderstorm with hail
]);

const FOG_CODES = new Set([
  45, 48,       // Fog and depositing rime fog
]);

const FREEZING_RAIN_CODES = new Set([
  56, 57,       // Freezing drizzle
  66, 67,       // Freezing rain
]);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WeatherGuardSettings {
  block_rain: boolean;
  block_snow: boolean;
  block_wind: boolean;
  wind_speed_threshold_mph: number;
  block_thunderstorms: boolean;
  block_freezing_rain: boolean;
  block_fog: boolean;
}

export const DEFAULT_WEATHER_GUARD_SETTINGS: WeatherGuardSettings = {
  block_rain: false,
  block_snow: false,
  block_wind: false,
  wind_speed_threshold_mph: 25,
  block_thunderstorms: false,
  block_freezing_rain: false,
  block_fog: false,
};

export interface HourlyForecast {
  time: string;      // ISO "YYYY-MM-DDTHH:mm"
  weatherCode: number;
  windSpeedMph: number;
}

export interface WeatherBlockedSlot {
  time: string;      // "HH:mm"
  reasons: string[];
}

interface OpenMeteoHourlyResponse {
  hourly: {
    time: string[];
    weather_code: number[];
    wind_speed_10m: number[];
  };
}

// ─── API ────────────────────────────────────────────────────────────────────

const KMH_TO_MPH = 0.621371;

/**
 * Fetch hourly forecast for a date range from Open-Meteo.
 * Returns weather codes + wind speed per hour.
 */
export async function fetchWeatherForecast(
  lat: number,
  lng: number,
  startDate: string,   // "YYYY-MM-DD"
  endDate: string,     // "YYYY-MM-DD"
): Promise<HourlyForecast[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toString());
  url.searchParams.set("longitude", lng.toString());
  url.searchParams.set("hourly", "weather_code,wind_speed_10m");
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url.toString());
  if (!response.ok) {
    console.error("[WeatherGuard] API error:", response.status);
    return [];
  }

  const data: OpenMeteoHourlyResponse = await response.json();
  if (!data.hourly?.time) return [];

  return data.hourly.time.map((t, i) => ({
    time: t,
    weatherCode: data.hourly.weather_code[i],
    windSpeedMph: data.hourly.wind_speed_10m[i] * KMH_TO_MPH,
  }));
}

// ─── Blocking Logic ─────────────────────────────────────────────────────────

/**
 * Given the hourly forecast for a specific day and the shop's
 * Weather Guard settings, return which time slots should be blocked
 * along with human-readable reasons.
 */
export function getBlockedSlots(
  forecast: HourlyForecast[],
  settings: WeatherGuardSettings,
  date: string, // "YYYY-MM-DD" to filter forecast to that day
): WeatherBlockedSlot[] {
  const blocked: WeatherBlockedSlot[] = [];

  for (const hour of forecast) {
    // Only check hours on the target date
    if (!hour.time.startsWith(date)) continue;

    const reasons = new Set<string>();
    const code = hour.weatherCode;

    if (settings.block_rain && RAIN_CODES.has(code)) {
      reasons.add(getWeatherLabel(code));
    }
    if (settings.block_snow && SNOW_CODES.has(code)) {
      reasons.add(getWeatherLabel(code));
    }
    if (settings.block_thunderstorms && THUNDERSTORM_CODES.has(code)) {
      reasons.add(getWeatherLabel(code));
    }
    if (settings.block_freezing_rain && FREEZING_RAIN_CODES.has(code)) {
      reasons.add(getWeatherLabel(code));
    }
    if (settings.block_fog && FOG_CODES.has(code)) {
      reasons.add(getWeatherLabel(code));
    }
    if (settings.block_wind && hour.windSpeedMph >= settings.wind_speed_threshold_mph) {
      reasons.add(`High wind (${Math.round(hour.windSpeedMph)} mph)`);
    }

    if (reasons.size > 0) {
      // Extract "HH:mm" from "YYYY-MM-DDTHH:mm"
      const slotTime = hour.time.split("T")[1]?.substring(0, 5);
      if (slotTime) {
        blocked.push({ time: slotTime, reasons: Array.from(reasons) });
      }
    }
  }

  return blocked;
}

/**
 * Check if a given slot time falls within a weather-blocked hour.
 * Slot times are "HH:mm". A slot is blocked if ANY hour intersected by
 * the slot window (start → start + duration) is weather-blocked.
 *
 * `slotDurationMinutes` defaults to 60 to preserve backward compatibility
 * with callers that only check the starting hour.
 */
export function isSlotWeatherBlocked(
  slotTime: string,
  blockedSlots: WeatherBlockedSlot[],
  slotDurationMinutes = 60,
): { blocked: boolean; reasons: string[] } {
  const [h, m] = slotTime.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h)) return { blocked: false, reasons: [] };
  const startMin = h * 60 + (Number.isNaN(m) ? 0 : m);
  const endMin = startMin + Math.max(15, slotDurationMinutes);
  const reasons = new Set<string>();
  for (const b of blockedSlots) {
    const bh = parseInt(b.time.substring(0, 2), 10);
    if (Number.isNaN(bh)) continue;
    const bStart = bh * 60;
    const bEnd = bStart + 60;
    if (bStart < endMin && bEnd > startMin) {
      for (const r of b.reasons) reasons.add(r);
    }
  }
  return reasons.size > 0
    ? { blocked: true, reasons: Array.from(reasons) }
    : { blocked: false, reasons: [] };
}

/**
 * Returns true if ANY hour between openingTime and closingTime (HH:mm)
 * is weather-blocked. Used to disable an entire day on the booking
 * calendar when the shop's blocking conditions are forecast during
 * operating hours.
 */
export function isAnyOperatingHourBlocked(
  blockedSlots: WeatherBlockedSlot[],
  openingTime: string | null,
  closingTime: string | null,
): boolean {
  if (!blockedSlots.length) return false;
  const parseT = (t: string | null, fallback: number) => {
    if (!t) return fallback;
    const [h, m] = t.split(":").map((n) => parseInt(n, 10));
    if (Number.isNaN(h)) return fallback;
    return h * 60 + (Number.isNaN(m) ? 0 : m);
  };
  const openMin = parseT(openingTime, 0);
  const closeMin = parseT(closingTime, 24 * 60);
  return blockedSlots.some((b) => {
    const bh = parseInt(b.time.substring(0, 2), 10);
    if (Number.isNaN(bh)) return false;
    const bStart = bh * 60;
    const bEnd = bStart + 60;
    return bStart < closeMin && bEnd > openMin;
  });
}

// ─── WMO Code Labels ────────────────────────────────────────────────────────

const WMO_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function getWeatherLabel(code: number): string {
  return WMO_LABELS[code] ?? `Weather code ${code}`;
}

/**
 * Returns the weather emoji icon for a WMO code
 */
export function getWeatherIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (FOG_CODES.has(code)) return "🌫️";
  if (SNOW_CODES.has(code)) return "🌨️";
  if (FREEZING_RAIN_CODES.has(code)) return "🧊";
  if (THUNDERSTORM_CODES.has(code)) return "⛈️";
  if (RAIN_CODES.has(code)) return "🌧️";
  return "🌤️";
}

/** Parse settings from DB JSON safely */
export function parseWeatherGuardSettings(raw: unknown): WeatherGuardSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_WEATHER_GUARD_SETTINGS };
  const s = raw as Record<string, unknown>;
  return {
    block_rain: s.block_rain === true,
    block_snow: s.block_snow === true,
    block_wind: s.block_wind === true,
    wind_speed_threshold_mph:
      typeof s.wind_speed_threshold_mph === "number"
        ? s.wind_speed_threshold_mph
        : 25,
    block_thunderstorms: s.block_thunderstorms === true,
    block_freezing_rain: s.block_freezing_rain === true,
    block_fog: s.block_fog === true,
  };
}
