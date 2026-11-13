/**
 * Service Menu pure-logic tests: guardrails, combo savings, catalog-price
 * resolution, and the MOMS template (structure/names only — no prices).
 */
import { describe, it, expect } from "@jest/globals";
import {
  catalogPrice,
  comboSavings,
  resolveMenu,
  validateMenuConfig,
  type CatalogPriceSource,
  type MenuItemConfig,
  type MenuPackageSource,
} from "../menu";
import {
  MOMS_MOBILE_OIL_TEMPLATE,
  getServiceMenuTemplate,
  mapTemplateToCatalog,
  normalizeServiceName,
} from "../templates";

const OIL: CatalogPriceSource = { id: "svc-oil", name: "Full Synthetic Oil Change", labor_price: 119, is_active: true, estimated_minutes: 45 };
const MOBIL: CatalogPriceSource = { id: "svc-mobil", name: "Mobil 1 Full Synthetic Oil Change", labor_price: 129, is_active: true };
const EURO: CatalogPriceSource = { id: "svc-euro", name: "European Full Synthetic Oil Change", labor_price: 149, is_active: true };
const DIESEL: CatalogPriceSource = { id: "svc-diesel", name: "Diesel Oil Change", labor_price: 169, is_active: true };
const ROTATION: CatalogPriceSource = { id: "svc-rotation", name: "Tire Rotation", labor_price: 49, is_active: true };
const WIPERS: CatalogPriceSource = { id: "svc-wipers", name: "Wiper Set", labor_price: 39, is_active: true };
const ENGINE_FILTER: CatalogPriceSource = { id: "svc-engine-filter", name: "Engine Air Filter Replacement", labor_price: 29, is_active: true };
const CABIN_FILTER: CatalogPriceSource = { id: "svc-cabin-filter", name: "Cabin Air Filter Replacement", labor_price: 29, is_active: true };
const BATTERY_TEST: CatalogPriceSource = { id: "svc-battery", name: "Battery Test", labor_price: 0, is_active: true };

const CATALOG = [OIL, MOBIL, EURO, DIESEL, ROTATION, WIPERS, ENGINE_FILTER, CABIN_FILTER, BATTERY_TEST];
const catalogById = new Map(CATALOG.map((r) => [r.id, r]));

const TWO_CAR: MenuPackageSource = {
  id: "pkg-2car",
  name: "2-Car Driveway Deal",
  packagePrice: 219,
  isActive: true,
  items: [{ serviceCatalogId: "svc-oil", quantity: 2, overridePrice: null }],
};

const COMMUTER: MenuPackageSource = {
  id: "pkg-commuter",
  name: "The Commuter",
  packagePrice: 139,
  isActive: true,
  items: [
    { serviceCatalogId: "svc-oil", quantity: 1, overridePrice: null },
    { serviceCatalogId: "svc-rotation", quantity: 1, overridePrice: null },
  ],
};

describe("catalogPrice", () => {
  it("prefers labor_price (the booking price column)", () => {
    expect(catalogPrice({ id: "x", name: "X", labor_price: 119, default_price: 999 })).toBe(119);
  });
  it("falls back to default_price, then 0", () => {
    expect(catalogPrice({ id: "x", name: "X", default_price: 55 })).toBe(55);
    expect(catalogPrice({ id: "x", name: "X" })).toBe(0);
    expect(catalogPrice({ id: "x", name: "X", labor_price: -5 })).toBe(0);
  });
});

describe("comboSavings", () => {
  it("computes savings vs buying the parts separately", () => {
    const result = comboSavings(TWO_CAR, catalogById);
    expect(result.separateTotal).toBe(238);
    expect(result.bundlePrice).toBe(219);
    expect(result.savings).toBe(19);
    expect(result.savingsPercent).toBe(8);
  });
  it("honors per-item override prices like the packages query does", () => {
    const pkg: MenuPackageSource = {
      ...COMMUTER,
      items: [
        { serviceCatalogId: "svc-oil", quantity: 1, overridePrice: 100 },
        { serviceCatalogId: "svc-rotation", quantity: 1, overridePrice: null },
      ],
    };
    expect(comboSavings(pkg, catalogById).separateTotal).toBe(149);
  });
  it("reports negative savings when a bundle is priced above separate", () => {
    const pkg: MenuPackageSource = { ...COMMUTER, packagePrice: 200 };
    expect(comboSavings(pkg, catalogById).savings).toBe(-32);
  });
});

describe("validateMenuConfig guardrails", () => {
  const core = (id: string, extra: Partial<MenuItemConfig> = {}): MenuItemConfig => ({
    role: "core",
    serviceCatalogId: id,
    ...extra,
  });

  it("warns when the ladder has more than 3 core tiers", () => {
    const { warnings } = validateMenuConfig({
      items: [core("svc-oil"), core("svc-mobil"), core("svc-euro"), core("svc-diesel")],
    });
    expect(warnings.map((w) => w.code)).toContain("too_many_core_tiers");
  });
  it("does not warn at exactly 3 core tiers", () => {
    const { warnings, errors } = validateMenuConfig({
      items: [core("svc-oil"), core("svc-mobil", { isMostPopular: true }), core("svc-euro")],
    });
    expect(warnings.map((w) => w.code)).not.toContain("too_many_core_tiers");
    expect(errors).toHaveLength(0);
  });
  it("errors when more than one item is flagged Most Popular", () => {
    const { errors } = validateMenuConfig({
      items: [core("svc-oil", { isMostPopular: true }), core("svc-mobil", { isMostPopular: true })],
    });
    expect(errors.map((e) => e.code)).toContain("multiple_most_popular");
  });
  it("errors when more than one hero is supplied", () => {
    const { errors } = validateMenuConfig({ items: [], heroPackageIds: ["pkg-a", "pkg-b"] });
    expect(errors.map((e) => e.code)).toContain("multiple_heroes");
  });
  it("accepts a single hero (and ignores empty slots)", () => {
    const { errors } = validateMenuConfig({ items: [], heroPackageIds: [null, "pkg-a", undefined] });
    expect(errors).toHaveLength(0);
  });
  it("warns when a combo is priced above its parts separately", () => {
    const pricey: MenuPackageSource = { ...COMMUTER, packagePrice: 500 };
    const { warnings } = validateMenuConfig({
      items: [{ role: "combo", packageId: pricey.id }],
      packages: [pricey],
      catalogById,
    });
    expect(warnings.map((w) => w.code)).toContain("combo_priced_above_separate");
  });
  it("warns when a side's with-service price exceeds its standalone price", () => {
    const { warnings } = validateMenuConfig({
      items: [{ role: "side", serviceCatalogId: "svc-wipers", withServicePrice: 59 }],
      catalogById,
    });
    expect(warnings.map((w) => w.code)).toContain("side_with_service_above_standalone");
  });
});

describe("resolveMenu", () => {
  const items: MenuItemConfig[] = [
    { role: "core", serviceCatalogId: "svc-oil", sortOrder: 10 },
    { role: "core", serviceCatalogId: "svc-mobil", isMostPopular: true, sortOrder: 20 },
    { role: "core", serviceCatalogId: "svc-euro", sortOrder: 30 },
    { role: "combo", packageId: "pkg-commuter", sortOrder: 40 },
    { role: "side", serviceCatalogId: "svc-wipers", withServicePrice: 29, sortOrder: 50 },
  ];

  it("returns null when the menu is disabled (feature off = no render)", () => {
    expect(
      resolveMenu({ settings: { enabled: false }, items, catalog: CATALOG, packages: [COMMUTER] }),
    ).toBeNull();
  });

  it("resolves core prices from the live catalog rows passed in", () => {
    const menu = resolveMenu({
      settings: { enabled: true, heroPackageId: "pkg-2car", heroLabel: "Both cars. One trip." },
      items,
      catalog: CATALOG,
      packages: [COMMUTER, TWO_CAR],
    });
    expect(menu?.core.map((c) => [c.name, c.price])).toEqual([
      ["Full Synthetic Oil Change", 119],
      ["Mobil 1 Full Synthetic Oil Change", 129],
      ["European Full Synthetic Oil Change", 149],
    ]);
    expect(menu?.core[1].isMostPopular).toBe(true);
    expect(menu?.combos[0]).toMatchObject({ name: "The Commuter", price: 139, separateTotal: 168, savings: 29 });
    expect(menu?.sides[0]).toMatchObject({ standalonePrice: 39, withServicePrice: 29 });
    expect(menu?.hero).toMatchObject({ name: "2-Car Driveway Deal", price: 219, savings: 19 });
  });

  it("exposes booking target ids for core, combo, side, and hero entries", () => {
    const menu = resolveMenu({
      settings: { enabled: true, heroPackageId: "pkg-2car" },
      items,
      catalog: CATALOG,
      packages: [COMMUTER, TWO_CAR],
    });
    expect(menu?.core.map((c) => c.serviceCatalogId)).toEqual(["svc-oil", "svc-mobil", "svc-euro"]);
    expect(menu?.combos[0].packageId).toBe("pkg-commuter");
    expect(menu?.sides[0].serviceCatalogId).toBe("svc-wipers");
    expect(menu?.hero?.packageId).toBe("pkg-2car");
  });

  it("gives draft entries a null target id (never selectable)", () => {
    const menu = resolveMenu({
      settings: { enabled: true },
      items: [
        { role: "core", serviceCatalogId: null, displayName: "Future Service", isDraft: true },
        { role: "combo", packageId: null, displayName: "Future Combo", isDraft: true },
        { role: "side", serviceCatalogId: null, displayName: "Future Side", isDraft: true },
      ],
      catalog: CATALOG,
      packages: [],
    });
    expect(menu?.core[0].serviceCatalogId).toBeNull();
    expect(menu?.combos[0].packageId).toBeNull();
    expect(menu?.sides[0].serviceCatalogId).toBeNull();
  });

  it("tracks a catalog price change with no menu edit (one source of truth)", () => {
    const repriced = CATALOG.map((r) => (r.id === "svc-oil" ? { ...r, labor_price: 109 } : r));
    const menu = resolveMenu({ settings: { enabled: true }, items, catalog: repriced, packages: [COMMUTER] });
    expect(menu?.core[0].price).toBe(109);
  });

  it("excludes inactive catalog services", () => {
    const withInactive = [...CATALOG, { id: "svc-dead", name: "Dead Service", labor_price: 10, is_active: false }];
    const menu = resolveMenu({
      settings: { enabled: true },
      items: [{ role: "core", serviceCatalogId: "svc-dead" }],
      catalog: withInactive,
      packages: [],
    });
    expect(menu?.core).toHaveLength(0);
  });

  it("renders drafts with a null price and can hide them for the public surface", () => {
    const draftItems: MenuItemConfig[] = [
      { role: "core", serviceCatalogId: null, displayName: "Future Service", isDraft: true },
    ];
    const withDrafts = resolveMenu({ settings: { enabled: true }, items: draftItems, catalog: CATALOG, packages: [] });
    expect(withDrafts?.core[0]).toMatchObject({ name: "Future Service", price: null, isDraft: true });
    const publicMenu = resolveMenu({
      settings: { enabled: true },
      items: draftItems,
      catalog: CATALOG,
      packages: [],
      includeDrafts: false,
    });
    expect(publicMenu?.core).toHaveLength(0);
  });
});

describe("MOMS template", () => {
  function collectKeys(value: unknown, into: string[]): void {
    if (Array.isArray(value)) {
      value.forEach((v) => collectKeys(v, into));
    } else if (value && typeof value === "object") {
      for (const [key, v] of Object.entries(value)) {
        into.push(key);
        collectKeys(v, into);
      }
    }
  }

  it("carries structure and names only — no price fields anywhere", () => {
    const keys: string[] = [];
    collectKeys(MOMS_MOBILE_OIL_TEMPLATE, keys);
    const priceKeys = keys.filter((k) => /price|cost|amount|fee|discount/i.test(k));
    expect(priceKeys).toEqual([]);
  });

  it("contains the agreed MOMS core ladder, combos, and sides by name", () => {
    const names = MOMS_MOBILE_OIL_TEMPLATE.entries.map((e) => e.name);
    for (const expected of [
      "Full Synthetic Oil Change",
      "Mobil 1 Full Synthetic Oil Change",
      "European Full Synthetic Oil Change",
      "The Essential",
      "The Commuter",
      "The Road Ready",
      "Wiper Set",
      "Engine Air Filter",
      "Cabin Air Filter",
      "Both Filters Pair",
      "Tire Rotation",
      "Battery Test",
    ]) {
      expect(names).toContain(expected);
    }
    expect(getServiceMenuTemplate("moms-mobile-oil")?.id).toBe("moms-mobile-oil");
    expect(getServiceMenuTemplate("nope")).toBeNull();
  });

  it("normalizes names for loose catalog matching", () => {
    expect(normalizeServiceName("Engine Air Filter Replacement")).toBe(
      normalizeServiceName("Engine Air Filter"),
    );
  });

  it("maps matched entries to the shop's catalog and leaves the rest as drafts", () => {
    const shopCatalog = CATALOG.filter((r) => r.id !== "svc-euro"); // shop has no European service
    const placements = mapTemplateToCatalog(MOMS_MOBILE_OIL_TEMPLATE, shopCatalog, [COMMUTER]);

    const mobil = placements.find((p) => p.templateEntryName === "Mobil 1 Full Synthetic Oil Change");
    expect(mobil).toMatchObject({ serviceCatalogId: "svc-mobil", isDraft: false, isMostPopular: true });

    const euro = placements.find((p) => p.templateEntryName === "European Full Synthetic Oil Change");
    expect(euro).toMatchObject({ serviceCatalogId: null, isDraft: true, displayName: "European Full Synthetic Oil Change" });

    // Existing package matched by name → real combo placement.
    const commuter = placements.find((p) => p.templateEntryName === "The Commuter");
    expect(commuter).toMatchObject({ packageId: "pkg-commuter", isDraft: false });

    // No package named "The Road Ready", but all members exist → draft combo carrying member ids.
    const roadReady = placements.find((p) => p.templateEntryName === "The Road Ready");
    expect(roadReady?.isDraft).toBe(true);
    expect(roadReady?.memberServiceCatalogIds).toEqual(["svc-oil", "svc-rotation", "svc-wipers"]);

    // No placement anywhere carries a price-shaped field.
    for (const placement of placements) {
      expect(Object.keys(placement).join(",")).not.toMatch(/price/i);
    }
  });
});
