/**
 * Service Menu → booking-selection adapter tests.
 *
 * The adapter translates menu clicks into the booking flow's existing
 * `{ services, package }` selection shape. These tests pin the toggle
 * semantics (mirroring ServiceSelectionStep) and the with-service side
 * pricing rule: a side is stored at its with-service price only while
 * the same selection holds a package or a non-side service, and returns
 * to its exact catalog price when qualification goes away.
 */
import { describe, it, expect } from "@jest/globals";
import {
  resolveMenu,
  type CatalogPriceSource,
  type MenuItemConfig,
  type MenuPackageSource,
} from "../menu";
import {
  isPackageEntrySelected,
  isServiceEntrySelected,
  menuSidePriceMap,
  repriceSides,
  selectionQualifiesForWithService,
  togglePackageInSelection,
  toggleServiceInSelection,
  type SelectionLike,
} from "../booking-selection";

interface Svc {
  id: string;
  name: string;
  default_price: number;
}
interface Pkg {
  id: string;
  name: string;
}
type Sel = SelectionLike<Svc, Pkg>;

const OIL: Svc = { id: "svc-oil", name: "Full Synthetic Oil Change", default_price: 119 };
const WIPERS: Svc = { id: "svc-wipers", name: "Wiper Set", default_price: 39 };
const FILTER: Svc = { id: "svc-filter", name: "Engine Air Filter", default_price: 29 };
const CATALOG_OBJECTS: Svc[] = [OIL, WIPERS, FILTER];

const COMMUTER_PKG: Pkg = { id: "pkg-commuter", name: "The Commuter" };
const HERO_PKG: Pkg = { id: "pkg-2car", name: "2-Car Driveway Deal" };

const EMPTY: Sel = { services: [], package: null };

function buildSidePrices() {
  const catalog: CatalogPriceSource[] = [
    { id: "svc-oil", name: "Full Synthetic Oil Change", labor_price: 119, is_active: true },
    { id: "svc-wipers", name: "Wiper Set", labor_price: 39, is_active: true },
    { id: "svc-filter", name: "Engine Air Filter", labor_price: 29, is_active: true },
  ];
  const packages: MenuPackageSource[] = [
    {
      id: "pkg-commuter",
      name: "The Commuter",
      packagePrice: 139,
      isActive: true,
      items: [
        { serviceCatalogId: "svc-oil", quantity: 1, overridePrice: null },
        { serviceCatalogId: "svc-wipers", quantity: 1, overridePrice: null },
      ],
    },
  ];
  const items: MenuItemConfig[] = [
    { role: "core", serviceCatalogId: "svc-oil" },
    { role: "side", serviceCatalogId: "svc-wipers", withServicePrice: 29 },
    { role: "side", serviceCatalogId: "svc-filter", withServicePrice: 19 },
  ];
  const menu = resolveMenu({
    settings: { enabled: true },
    items,
    catalog,
    packages,
  });
  return menuSidePriceMap(menu);
}

const sidePrices = buildSidePrices();

describe("menuSidePriceMap", () => {
  it("maps sides with a genuine with-service discount", () => {
    expect(sidePrices.get("svc-wipers")).toBe(29);
    expect(sidePrices.get("svc-filter")).toBe(19);
    expect(sidePrices.has("svc-oil")).toBe(false);
  });

  it("is empty for a null menu and excludes non-discount sides", () => {
    expect(menuSidePriceMap(null).size).toBe(0);
    const menu = resolveMenu({
      settings: { enabled: true },
      items: [{ role: "side", serviceCatalogId: "svc-wipers", withServicePrice: 45 }],
      catalog: [{ id: "svc-wipers", name: "Wiper Set", labor_price: 39, is_active: true }],
      packages: [],
    });
    // with-service price above standalone is a builder error state, not a discount.
    expect(menuSidePriceMap(menu).size).toBe(0);
  });
});

describe("toggle semantics mirror ServiceSelectionStep", () => {
  it("core click selects the catalog service, second click deselects it", () => {
    const once = toggleServiceInSelection(EMPTY, OIL, CATALOG_OBJECTS, sidePrices);
    expect(once.services.map((s) => s.id)).toEqual(["svc-oil"]);
    expect(once.package).toBeNull();
    const twice = toggleServiceInSelection(once, OIL, CATALOG_OBJECTS, sidePrices);
    expect(twice.services).toHaveLength(0);
  });

  it("toggling a service clears a selected package", () => {
    const withPackage: Sel = { services: [], package: COMMUTER_PKG };
    const next = toggleServiceInSelection(withPackage, OIL, CATALOG_OBJECTS, sidePrices);
    expect(next.package).toBeNull();
    expect(next.services.map((s) => s.id)).toEqual(["svc-oil"]);
  });

  it("combo click selects the package and clears services; same package toggles off", () => {
    const withService: Sel = { services: [OIL], package: null };
    const selected = togglePackageInSelection(withService, COMMUTER_PKG);
    expect(selected.services).toHaveLength(0);
    expect(selected.package?.id).toBe("pkg-commuter");
    const deselected = togglePackageInSelection(selected, COMMUTER_PKG);
    expect(deselected.package).toBeNull();
  });

  it("hero is just a package toggle (exposed via its package id)", () => {
    const selected = togglePackageInSelection(EMPTY, HERO_PKG);
    expect(isPackageEntrySelected("pkg-2car", selected)).toBe(true);
    expect(isPackageEntrySelected("pkg-commuter", selected)).toBe(false);
  });
});

describe("with-service side pricing", () => {
  it("a side added alone is stored at its standalone catalog price", () => {
    const next = toggleServiceInSelection(EMPTY, WIPERS, CATALOG_OBJECTS, sidePrices);
    expect(next.services[0].default_price).toBe(39);
  });

  it("a side added alongside a core service is stored at its with-service price", () => {
    const withCore = toggleServiceInSelection(EMPTY, OIL, CATALOG_OBJECTS, sidePrices);
    const next = toggleServiceInSelection(withCore, WIPERS, CATALOG_OBJECTS, sidePrices);
    expect(next.services.find((s) => s.id === "svc-wipers")?.default_price).toBe(29);
    // The core service itself is never repriced.
    expect(next.services.find((s) => s.id === "svc-oil")?.default_price).toBe(119);
  });

  it("adding the core service afterwards reprices an already-selected side", () => {
    const sideFirst = toggleServiceInSelection(EMPTY, WIPERS, CATALOG_OBJECTS, sidePrices);
    expect(sideFirst.services[0].default_price).toBe(39);
    const next = toggleServiceInSelection(sideFirst, OIL, CATALOG_OBJECTS, sidePrices);
    expect(next.services.find((s) => s.id === "svc-wipers")?.default_price).toBe(29);
  });

  it("removing the qualifying service restores the side's exact standalone price", () => {
    const withCore = toggleServiceInSelection(EMPTY, OIL, CATALOG_OBJECTS, sidePrices);
    const qualified = toggleServiceInSelection(withCore, WIPERS, CATALOG_OBJECTS, sidePrices);
    expect(qualified.services.find((s) => s.id === "svc-wipers")?.default_price).toBe(29);
    const next = toggleServiceInSelection(qualified, OIL, CATALOG_OBJECTS, sidePrices);
    expect(next.services.find((s) => s.id === "svc-wipers")?.default_price).toBe(39);
  });

  it("two discounted sides alone do not qualify each other", () => {
    const one = toggleServiceInSelection(EMPTY, WIPERS, CATALOG_OBJECTS, sidePrices);
    const two = toggleServiceInSelection(one, FILTER, CATALOG_OBJECTS, sidePrices);
    expect(two.services.find((s) => s.id === "svc-wipers")?.default_price).toBe(39);
    expect(two.services.find((s) => s.id === "svc-filter")?.default_price).toBe(29);
    expect(selectionQualifiesForWithService(two, sidePrices)).toBe(false);
  });

  it("a package in the selection qualifies sides for with-service pricing", () => {
    const selection: Sel = { services: [{ ...WIPERS }], package: COMMUTER_PKG };
    expect(selectionQualifiesForWithService(selection, sidePrices)).toBe(true);
    const repriced = repriceSides(selection, CATALOG_OBJECTS, sidePrices);
    expect(repriced.services[0].default_price).toBe(29);
  });

  it("repriceSides is a no-op (same reference) when nothing can change", () => {
    const noSides: Sel = { services: [OIL], package: null };
    expect(repriceSides(noSides, CATALOG_OBJECTS, sidePrices)).toBe(noSides);
    expect(repriceSides(noSides, CATALOG_OBJECTS, new Map())).toBe(noSides);
    const alreadyRight = toggleServiceInSelection(EMPTY, OIL, CATALOG_OBJECTS, sidePrices);
    expect(repriceSides(alreadyRight, CATALOG_OBJECTS, sidePrices)).toBe(alreadyRight);
  });
});

describe("selected-state helpers", () => {
  it("reflect actual selection state for services and packages", () => {
    const selection: Sel = { services: [OIL], package: null };
    expect(isServiceEntrySelected("svc-oil", selection)).toBe(true);
    expect(isServiceEntrySelected("svc-wipers", selection)).toBe(false);
    expect(isPackageEntrySelected("pkg-commuter", selection)).toBe(false);
  });

  it("draft entries (null target id) are never selected", () => {
    const selection: Sel = { services: [OIL], package: COMMUTER_PKG };
    expect(isServiceEntrySelected(null, selection)).toBe(false);
    expect(isPackageEntrySelected(null, selection)).toBe(false);
  });
});
