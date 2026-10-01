import {
  normalizeFluidQuantity,
} from "@/lib/fluidQuantity";

describe("fluidQuantity", () => {
  describe("empty input", () => {
    it("treats null/undefined/blank as cleared (no error)", () => {
      expect(normalizeFluidQuantity(null)).toEqual({ normalized: null, quarts: null });
      expect(normalizeFluidQuantity(undefined)).toEqual({ normalized: null, quarts: null });
      expect(normalizeFluidQuantity("   ")).toEqual({ normalized: null, quarts: null });
    });
  });

  describe("quart input", () => {
    it("normalizes plain quart quantities", () => {
      const result = normalizeFluidQuantity("6.5 qt");
      expect(result.normalized).toBe("6.5 qt");
      expect(result.quarts).toBe(6.5);
      expect(result.error).toBeUndefined();
    });

    it("accepts quart synonyms", () => {
      expect(normalizeFluidQuantity("7 qts")?.normalized).toBe("7 qt");
      expect(normalizeFluidQuantity("7 quarts")?.normalized).toBe("7 qt");
    });

    it("preserves trailing qualifiers by default", () => {
      expect(normalizeFluidQuantity("6.5 qt w/ filter").normalized).toBe("6.5 qt w/ filter");
    });

    it("drops qualifiers when keepQualifier is false", () => {
      expect(
        normalizeFluidQuantity("6.5 qt w/ filter", { keepQualifier: false }).normalized,
      ).toBe("6.5 qt");
    });
  });

  describe("liter input", () => {
    it("converts liters to quarts and annotates the original", () => {
      const result = normalizeFluidQuantity("5 L");
      expect(result.normalized).toBe("5.28 qt (5 L)");
      expect(result.quarts).toBeCloseTo(5.28, 2);
    });

    it("accepts comma decimals", () => {
      const result = normalizeFluidQuantity("5,2 litres");
      expect(result.quarts).toBeCloseTo(5.49, 2);
    });
  });

  describe("validation errors", () => {
    it("errors when no number is present", () => {
      const result = normalizeFluidQuantity("a lot");
      expect(result.error).toContain("must include a number");
    });

    it("errors on zero amounts", () => {
      expect(normalizeFluidQuantity("0 qt").error).toContain("greater than zero");
    });

    it("ignores a leading minus sign when extracting the number", () => {
      // NUMBER_RE captures digits only, so "-3 qt" parses as 3 qt
      expect(normalizeFluidQuantity("-3 qt").normalized).toBe("3 qt");
    });

    it("errors below the minimum and above the maximum", () => {
      expect(normalizeFluidQuantity("0.2 qt").error).toContain("too low");
      expect(normalizeFluidQuantity("40 qt").error).toContain("exceeds the 30 qt max");
    });

    it("uses the custom label in errors", () => {
      const result = normalizeFluidQuantity("40 qt", { label: "Oil capacity" });
      expect(result.error).toContain("Oil capacity");
    });
  });

  describe("soft warnings", () => {
    it("warns on unusually large but legal values", () => {
      const result = normalizeFluidQuantity("20 qt");
      expect(result.error).toBeUndefined();
      expect(result.warning).toContain("unusually large");
    });

    it("does not warn on normal values", () => {
      expect(normalizeFluidQuantity("6 qt").warning).toBeUndefined();
    });
  });
});
