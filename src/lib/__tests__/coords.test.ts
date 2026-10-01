import { isValidLngLat, normalizeLatLng, toFiniteNumber } from "@/lib/coords";

describe("coords", () => {
  describe("toFiniteNumber", () => {
    it("passes finite numbers through", () => {
      expect(toFiniteNumber(12.5)).toBe(12.5);
      expect(toFiniteNumber(0)).toBe(0);
    });

    it("parses numeric strings (DB numeric columns arrive as strings)", () => {
      expect(toFiniteNumber("39.95")).toBe(39.95);
      expect(toFiniteNumber(" -75.16 ")).toBe(-75.16);
    });

    it("returns null for non-numeric input", () => {
      expect(toFiniteNumber(null)).toBeNull();
      expect(toFiniteNumber(undefined)).toBeNull();
      expect(toFiniteNumber("")).toBeNull();
      expect(toFiniteNumber("   ")).toBeNull();
      expect(toFiniteNumber("abc")).toBeNull();
      expect(toFiniteNumber(NaN)).toBeNull();
      expect(toFiniteNumber(Infinity)).toBeNull();
      expect(toFiniteNumber({})).toBeNull();
    });
  });

  describe("isValidLngLat", () => {
    it("accepts valid coordinates", () => {
      expect(isValidLngLat(-75.16, 39.95)).toBe(true);
    });

    it("rejects the null-island placeholder", () => {
      expect(isValidLngLat(0, 0)).toBe(false);
      expect(isValidLngLat("0", "0")).toBe(false);
    });

    it("rejects out-of-range values", () => {
      expect(isValidLngLat(-181, 40)).toBe(false);
      expect(isValidLngLat(181, 40)).toBe(false);
      expect(isValidLngLat(-75, 91)).toBe(false);
      expect(isValidLngLat(-75, -91)).toBe(false);
    });

    it("accepts boundary values", () => {
      expect(isValidLngLat(-180, -90)).toBe(true);
      expect(isValidLngLat(180, 90)).toBe(true);
    });

    it("rejects non-numeric input", () => {
      expect(isValidLngLat(null, 40)).toBe(false);
      expect(isValidLngLat(-75, undefined)).toBe(false);
    });
  });

  describe("normalizeLatLng", () => {
    it("normalizes { lat, lng } objects", () => {
      expect(normalizeLatLng({ lat: 39.95, lng: -75.16 })).toEqual({
        lat: 39.95,
        lng: -75.16,
      });
    });

    it("supports latitude/longitude and lon aliases", () => {
      expect(normalizeLatLng({ latitude: "39.95", longitude: "-75.16" })).toEqual({
        lat: 39.95,
        lng: -75.16,
      });
      expect(normalizeLatLng({ lat: 39.95, lon: -75.16 })).toEqual({
        lat: 39.95,
        lng: -75.16,
      });
    });

    it("returns null for missing or invalid coordinates", () => {
      expect(normalizeLatLng(null)).toBeNull();
      expect(normalizeLatLng({})).toBeNull();
      expect(normalizeLatLng({ lat: 39.95 })).toBeNull();
      expect(normalizeLatLng({ lat: 0, lng: 0 })).toBeNull();
      expect(normalizeLatLng("39.95,-75.16")).toBeNull();
    });
  });
});
