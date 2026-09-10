import { calculateExtraOilQuarts, parseOilCapacityToQuarts } from "./oilCapacity";

describe("oil capacity billing", () => {
  it("converts 5.7 liters to about 6 quarts", () => {
    expect(parseOilCapacityToQuarts("5.7 liters with filter")).toBe(6.02);
  });

  it("bills one extra quart for a nominal 5.7 liter capacity", () => {
    expect(calculateExtraOilQuarts("5.7 liters with filter")).toBe(1);
  });

  it("does not bill extra oil at five quarts", () => {
    expect(calculateExtraOilQuarts("5 qt")).toBe(0);
  });

  it("still bills two extra quarts for materially larger capacities", () => {
    expect(calculateExtraOilQuarts("6.5 qt")).toBe(2);
  });
});
