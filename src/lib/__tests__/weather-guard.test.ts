/**
 * Weather Guard — Unit tests for blocking logic
 */
import {
  getBlockedSlots,
  isSlotWeatherBlocked,
  parseWeatherGuardSettings,
  getWeatherLabel,
  getWeatherIcon,
  DEFAULT_WEATHER_GUARD_SETTINGS,
  type HourlyForecast,
  type WeatherGuardSettings,
} from "@/lib/weather-guard";

describe("weather-guard", () => {
  const makeForecast = (
    overrides: Partial<HourlyForecast>[] = [],
  ): HourlyForecast[] => {
    // Create a full day of clear weather
    const base: HourlyForecast[] = Array.from({ length: 24 }, (_, i) => ({
      time: `2026-02-20T${String(i).padStart(2, "0")}:00`,
      weatherCode: 0,
      windSpeedMph: 5,
    }));
    // Apply overrides
    for (const o of overrides) {
      const idx = base.findIndex((f) => f.time === o.time);
      if (idx !== -1) {
        base[idx] = { ...base[idx], ...o };
      }
    }
    return base;
  };

  describe("parseWeatherGuardSettings", () => {
    it("returns defaults for null input", () => {
      expect(parseWeatherGuardSettings(null)).toEqual(DEFAULT_WEATHER_GUARD_SETTINGS);
    });

    it("returns defaults for invalid input", () => {
      expect(parseWeatherGuardSettings("not an object")).toEqual(DEFAULT_WEATHER_GUARD_SETTINGS);
    });

    it("parses valid settings", () => {
      const raw = { block_rain: true, block_snow: false, block_wind: true, wind_speed_threshold_mph: 30 };
      const result = parseWeatherGuardSettings(raw);
      expect(result.block_rain).toBe(true);
      expect(result.block_snow).toBe(false);
      expect(result.block_wind).toBe(true);
      expect(result.wind_speed_threshold_mph).toBe(30);
    });
  });

  describe("getBlockedSlots", () => {
    it("returns empty array when no conditions blocked", () => {
      const forecast = makeForecast([
        { time: "2026-02-20T10:00", weatherCode: 61 }, // Rain
      ]);
      const settings: WeatherGuardSettings = { ...DEFAULT_WEATHER_GUARD_SETTINGS };
      // block_rain defaults to false
      const blocked = getBlockedSlots(forecast, settings, "2026-02-20");
      expect(blocked).toHaveLength(0);
    });

    it("blocks rain slots when block_rain is enabled", () => {
      const forecast = makeForecast([
        { time: "2026-02-20T09:00", weatherCode: 61 }, // Slight rain
        { time: "2026-02-20T10:00", weatherCode: 63 }, // Moderate rain
        { time: "2026-02-20T14:00", weatherCode: 0 },  // Clear
      ]);
      const settings: WeatherGuardSettings = {
        ...DEFAULT_WEATHER_GUARD_SETTINGS,
        block_rain: true,
      };
      const blocked = getBlockedSlots(forecast, settings, "2026-02-20");
      expect(blocked).toHaveLength(2);
      expect(blocked[0].time).toBe("09:00");
      expect(blocked[1].time).toBe("10:00");
      expect(blocked[0].reasons[0]).toBe("Slight rain");
    });

    it("blocks snow slots when block_snow is enabled", () => {
      const forecast = makeForecast([
        { time: "2026-02-20T08:00", weatherCode: 71 }, // Slight snowfall
        { time: "2026-02-20T15:00", weatherCode: 85 }, // Slight snow showers
      ]);
      const settings: WeatherGuardSettings = {
        ...DEFAULT_WEATHER_GUARD_SETTINGS,
        block_snow: true,
      };
      const blocked = getBlockedSlots(forecast, settings, "2026-02-20");
      expect(blocked).toHaveLength(2);
      expect(blocked[0].reasons[0]).toBe("Slight snowfall");
    });

    it("blocks wind when exceeds threshold", () => {
      const forecast = makeForecast([
        { time: "2026-02-20T12:00", weatherCode: 0, windSpeedMph: 30 },
        { time: "2026-02-20T13:00", weatherCode: 0, windSpeedMph: 20 },
      ]);
      const settings: WeatherGuardSettings = {
        ...DEFAULT_WEATHER_GUARD_SETTINGS,
        block_wind: true,
        wind_speed_threshold_mph: 25,
      };
      const blocked = getBlockedSlots(forecast, settings, "2026-02-20");
      expect(blocked).toHaveLength(1);
      expect(blocked[0].time).toBe("12:00");
      expect(blocked[0].reasons[0]).toContain("High wind");
    });

    it("blocks thunderstorms when enabled", () => {
      const forecast = makeForecast([
        { time: "2026-02-20T16:00", weatherCode: 95 }, // Thunderstorm
      ]);
      const settings: WeatherGuardSettings = {
        ...DEFAULT_WEATHER_GUARD_SETTINGS,
        block_thunderstorms: true,
      };
      const blocked = getBlockedSlots(forecast, settings, "2026-02-20");
      expect(blocked).toHaveLength(1);
      expect(blocked[0].reasons[0]).toBe("Thunderstorm");
    });

    it("blocks freezing rain when enabled", () => {
      const forecast = makeForecast([
        { time: "2026-02-20T07:00", weatherCode: 66 }, // Light freezing rain
      ]);
      const settings: WeatherGuardSettings = {
        ...DEFAULT_WEATHER_GUARD_SETTINGS,
        block_freezing_rain: true,
      };
      const blocked = getBlockedSlots(forecast, settings, "2026-02-20");
      expect(blocked).toHaveLength(1);
      expect(blocked[0].reasons[0]).toBe("Light freezing rain");
    });

    it("does not treat freezing rain as regular rain when only rain blocking is enabled", () => {
      const forecast = makeForecast([
        { time: "2026-02-20T07:00", weatherCode: 66 }, // Light freezing rain
      ]);
      const settings: WeatherGuardSettings = {
        ...DEFAULT_WEATHER_GUARD_SETTINGS,
        block_rain: true,
        block_freezing_rain: false,
      };
      const blocked = getBlockedSlots(forecast, settings, "2026-02-20");
      expect(blocked).toHaveLength(0);
    });

    it("blocks fog when enabled", () => {
      const forecast = makeForecast([
        { time: "2026-02-20T06:00", weatherCode: 45 },
      ]);
      const settings: WeatherGuardSettings = {
        ...DEFAULT_WEATHER_GUARD_SETTINGS,
        block_fog: true,
      };
      const blocked = getBlockedSlots(forecast, settings, "2026-02-20");
      expect(blocked).toHaveLength(1);
      expect(blocked[0].reasons[0]).toBe("Fog");
    });

    it("combines multiple reasons for the same slot", () => {
      const forecast = makeForecast([
        { time: "2026-02-20T11:00", weatherCode: 65, windSpeedMph: 35 }, // Heavy rain + high wind
      ]);
      const settings: WeatherGuardSettings = {
        ...DEFAULT_WEATHER_GUARD_SETTINGS,
        block_rain: true,
        block_wind: true,
        wind_speed_threshold_mph: 25,
      };
      const blocked = getBlockedSlots(forecast, settings, "2026-02-20");
      expect(blocked).toHaveLength(1);
      expect(blocked[0].reasons).toHaveLength(2);
    });

    it("filters by date — ignores hours from other days", () => {
      const forecast: HourlyForecast[] = [
        { time: "2026-02-20T10:00", weatherCode: 61, windSpeedMph: 5 },
        { time: "2026-02-21T10:00", weatherCode: 61, windSpeedMph: 5 },
      ];
      const settings: WeatherGuardSettings = {
        ...DEFAULT_WEATHER_GUARD_SETTINGS,
        block_rain: true,
      };
      const blocked = getBlockedSlots(forecast, settings, "2026-02-20");
      expect(blocked).toHaveLength(1);
      expect(blocked[0].time).toBe("10:00");
    });
  });

  describe("isSlotWeatherBlocked", () => {
    it("returns blocked for matching hour", () => {
      const blockedSlots = [{ time: "10:00", reasons: ["Heavy rain"] }];
      const result = isSlotWeatherBlocked("10:30", blockedSlots);
      expect(result.blocked).toBe(true);
      expect(result.reasons).toEqual(["Heavy rain"]);
    });

    it("returns not blocked for non-matching hour", () => {
      const blockedSlots = [{ time: "10:00", reasons: ["Heavy rain"] }];
      const result = isSlotWeatherBlocked("11:00", blockedSlots);
      expect(result.blocked).toBe(false);
    });
  });

  describe("getWeatherLabel", () => {
    it("returns label for known code", () => {
      expect(getWeatherLabel(61)).toBe("Slight rain");
      expect(getWeatherLabel(95)).toBe("Thunderstorm");
    });

    it("returns fallback for unknown code", () => {
      expect(getWeatherLabel(999)).toBe("Weather code 999");
    });
  });

  describe("getWeatherIcon", () => {
    it("returns sun for clear", () => {
      expect(getWeatherIcon(0)).toBe("☀️");
    });

    it("returns rain for rain codes", () => {
      expect(getWeatherIcon(61)).toBe("🌧️");
    });

    it("returns snow for snow codes", () => {
      expect(getWeatherIcon(71)).toBe("🌨️");
    });

    it("returns thunderstorm for storm codes", () => {
      expect(getWeatherIcon(95)).toBe("⛈️");
    });
  });
});
