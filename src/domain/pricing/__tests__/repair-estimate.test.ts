import {
  DEFAULT_SHOP_LABOR_RATE,
  blendedPrice,
  buildQuoteLinesFromRepair,
  deriveLaborHours,
  extractRepairCosts,
  marketPosition,
  resolveShopLaborRate,
} from "../repair-estimate";
import type { RepairItem } from "@/application/queries/vehicle-repairs.query";

const repair: RepairItem = {
  title: "Alternator Replacement",
  description: "Replace failed alternator",
  costs: {
    independent: [
      { name: "part", low: 200, average: 250, high: 300 },
      { name: "labor", low: 120, average: 240, high: 360 },
      { name: "total", low: 320, average: 490, high: 660 },
    ],
    dealer: [
      { name: "part", low: 300, average: 350, high: 400 },
      { name: "labor", low: 200, average: 300, high: 400 },
      { name: "total", low: 500, average: 650, high: 800 },
    ],
  },
};

describe("repair-estimate", () => {
  it("extracts tier costs", () => {
    expect(extractRepairCosts(repair, "independent")).toMatchObject({ partAvg: 250, laborAvg: 240, totalAvg: 490 });
    expect(extractRepairCosts(repair, "dealer")).toMatchObject({ partAvg: 350, laborAvg: 300, totalAvg: 650 });
  });

  it("falls back to part+labor when no total is provided", () => {
    const noTotal: RepairItem = {
      ...repair,
      costs: { independent: [{ name: "part", low: 10, average: 20, high: 30 }], dealer: [] },
    };
    expect(extractRepairCosts(noTotal, "independent").totalAvg).toBe(20);
    expect(extractRepairCosts(noTotal, "dealer").totalAvg).toBe(0);
  });

  it("derives labor hours from the shop rate, not a hardcoded 120", () => {
    expect(deriveLaborHours(240, 120)).toBe(2);
    expect(deriveLaborHours(240, 160)).toBe(1.5);
    expect(deriveLaborHours(0, 120)).toBe(0);
    expect(deriveLaborHours(20, 120)).toBe(0.5); // floor of half an hour
    expect(deriveLaborHours(240, null)).toBe(240 / DEFAULT_SHOP_LABOR_RATE);
  });

  it("resolves the shop rate as the median of positive catalog rates", () => {
    expect(resolveShopLaborRate([100, 150, 200])).toBe(150);
    expect(resolveShopLaborRate([100, 200])).toBe(150);
    expect(resolveShopLaborRate([null, 0, undefined])).toBe(DEFAULT_SHOP_LABOR_RATE);
  });

  it("builds labor + part lines billed at the shop rate", () => {
    const built = buildQuoteLinesFromRepair(repair, "independent", { laborRate: 150 });
    expect(built.laborHours).toBe(1.6);
    expect(built.laborCost).toBe(240);
    expect(built.lines).toHaveLength(2);
    expect(built.lines[0].kind).toBe("labor");
    expect(built.lines[1]).toMatchObject({ kind: "part", unitPrice: 250 });
  });

  it("applies parts markup", () => {
    const built = buildQuoteLinesFromRepair(repair, "dealer", { laborRate: 150, partsMarkup: 0.2 });
    expect(built.lines.find((l) => l.kind === "part")?.unitPrice).toBe(420);
  });

  it("computes market position", () => {
    expect(marketPosition(441, 490)).toMatchObject({ percent: -10, label: "under" });
    expect(marketPosition(539, 490)).toMatchObject({ percent: 10, label: "over" });
    expect(marketPosition(490, 490)).toMatchObject({ label: "at" });
    expect(marketPosition(100, 0)).toBeNull();
  });

  it("computes blended catalog price", () => {
    expect(blendedPrice(490, 10)).toBe(539);
    expect(blendedPrice(0, 10)).toBe(0);
  });
});
