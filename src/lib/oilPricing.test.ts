import { DEFAULT_OIL_PRICE_PER_QUART, resolveOilPricePerQuart } from "./oilPricing";

describe("resolveOilPricePerQuart", () => {
  it("uses the first configured numeric oil price", () => {
    expect(resolveOilPricePerQuart(8, 4)).toBe(8);
    expect(resolveOilPricePerQuart("7.5", 4)).toBe(7.5);
  });

  it("falls back to the public profile value when the extended settings value is unavailable", () => {
    expect(resolveOilPricePerQuart(undefined, 6)).toBe(6);
    expect(resolveOilPricePerQuart(null, "9")).toBe(9);
  });

  it("preserves zero as an intentional configured price", () => {
    expect(resolveOilPricePerQuart(0, 4)).toBe(0);
  });

  it("uses the product default only when no numeric setting is available", () => {
    expect(resolveOilPricePerQuart(undefined, null, "not-a-number")).toBe(DEFAULT_OIL_PRICE_PER_QUART);
  });
});
