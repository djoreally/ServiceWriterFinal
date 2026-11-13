/**
 * Service Menu — pure logic.
 *
 * The menu is a presentation layer over a shop's existing ServiceWriter
 * catalog. This module owns the psychology guardrails, the combo-savings
 * math, and menu resolution. It is deliberately free of I/O: the server
 * loads catalog/package rows and hands them in; prices are resolved from
 * those rows at read time and are never stored on menu items.
 *
 * Guardrail philosophy (McDonald's / Popeyes menu boards):
 * - Core services form a small ladder — more than 3 tiers is a warning.
 * - Exactly one item may carry the "Most Popular" flag (error if more).
 * - Exactly one hero deal per menu (error if more than one is supplied).
 * - A combo priced above its parts bought separately defeats the point
 *   of a combo, so it warns.
 * - A side's with-service price above its standalone price warns.
 */

export type MenuRole = "core" | "combo" | "side";

/** A service_catalog row, reduced to the fields the menu reads. */
export interface CatalogPriceSource {
  id: string;
  name: string;
  description?: string | null;
  /** Canonical catalog price column used by booking / work orders. */
  labor_price?: number | null;
  /** Legacy/generated-types alias for the same price, when present. */
  default_price?: number | null;
  is_active?: boolean | null;
  estimated_minutes?: number | null;
}

/** One service_package_items row, reduced to the fields the menu reads. */
export interface PackageItemSource {
  serviceCatalogId: string;
  quantity: number;
  overridePrice?: number | null;
}

/** A service_packages row (the existing bundle concept — combos reuse it). */
export interface MenuPackageSource {
  id: string;
  name: string;
  description?: string | null;
  packagePrice: number;
  isActive?: boolean | null;
  items: PackageItemSource[];
}

/** One service_menu_items row, reduced to the fields the menu reads. */
export interface MenuItemConfig {
  id?: string;
  serviceCatalogId?: string | null;
  packageId?: string | null;
  role: MenuRole;
  isMostPopular?: boolean;
  /** Sides only: the price when added alongside a booked service. */
  withServicePrice?: number | null;
  /** Display-name override; required for draft (unmatched) entries. */
  displayName?: string | null;
  isDraft?: boolean;
  sortOrder?: number;
}

export interface MenuSettingsConfig {
  enabled: boolean;
  headline?: string | null;
  heroPackageId?: string | null;
  heroLabel?: string | null;
}

export interface MenuIssue {
  code: string;
  message: string;
}

export interface MenuValidation {
  errors: MenuIssue[];
  warnings: MenuIssue[];
}

export interface ComboSavings {
  /** Sum of the parts at catalog prices (override_price wins, like packages). */
  separateTotal: number;
  bundlePrice: number;
  savings: number;
  savingsPercent: number;
}

export interface ResolvedMenuEntry {
  key: string;
  name: string;
  description: string | null;
  isDraft: boolean;
}

export interface ResolvedCoreEntry extends ResolvedMenuEntry {
  price: number | null;
  estimatedMinutes: number | null;
  isMostPopular: boolean;
  /**
   * Booking target: the service_catalog id this entry selects, or null
   * for drafts (drafts have no target and are never selectable).
   */
  serviceCatalogId: string | null;
}

export interface ResolvedComboEntry extends ResolvedMenuEntry {
  price: number | null;
  separateTotal: number | null;
  savings: number | null;
  savingsPercent: number | null;
  includedNames: string[];
  /** Booking target: the service_packages id this entry selects, or null for drafts. */
  packageId: string | null;
}

export interface ResolvedSideEntry extends ResolvedMenuEntry {
  standalonePrice: number | null;
  withServicePrice: number | null;
  /** Booking target: the service_catalog id this entry selects, or null for drafts. */
  serviceCatalogId: string | null;
}

export interface ResolvedHero {
  name: string;
  label: string | null;
  price: number | null;
  separateTotal: number | null;
  savings: number | null;
  /** Booking target: the service_packages id the hero selects. */
  packageId: string;
}

export interface ResolvedMenu {
  headline: string | null;
  core: ResolvedCoreEntry[];
  combos: ResolvedComboEntry[];
  sides: ResolvedSideEntry[];
  hero: ResolvedHero | null;
  issues: MenuValidation;
}

function finitePrice(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The one place catalog price resolution lives for the menu: the live
 * catalog row wins, `labor_price` first (the column booking/work orders
 * use), `default_price` as the legacy alias. Menu items never carry a
 * price of their own for core/combo entries.
 */
export function catalogPrice(row: CatalogPriceSource): number {
  return roundMoney(finitePrice(row.labor_price ?? row.default_price ?? 0));
}

export function comboSavings(
  pkg: MenuPackageSource,
  catalogById: ReadonlyMap<string, CatalogPriceSource>,
): ComboSavings {
  let separate = 0;
  for (const item of pkg.items) {
    const catalogRow = catalogById.get(item.serviceCatalogId);
    const unit =
      item.overridePrice != null
        ? finitePrice(item.overridePrice)
        : catalogRow
          ? catalogPrice(catalogRow)
          : 0;
    separate += unit * Math.max(1, item.quantity || 1);
  }
  const separateTotal = roundMoney(separate);
  const bundlePrice = roundMoney(finitePrice(pkg.packagePrice));
  const savings = roundMoney(separateTotal - bundlePrice);
  return {
    separateTotal,
    bundlePrice,
    savings,
    savingsPercent:
      separateTotal > 0 ? Math.round((savings / separateTotal) * 100) : 0,
  };
}

/**
 * Guardrails for a menu configuration. Errors block saving (a menu with
 * two "Most Popular" flags or two heroes has no steering left); warnings
 * are advisory and surface in the builder.
 *
 * `heroPackageIds` is a list so merged configurations (shop settings +
 * template defaults, for example) can be checked for hero collisions —
 * a single settings row only ever contributes one entry.
 */
export function validateMenuConfig(input: {
  items: readonly MenuItemConfig[];
  heroPackageIds?: readonly (string | null | undefined)[];
  packages?: readonly MenuPackageSource[];
  catalogById?: ReadonlyMap<string, CatalogPriceSource>;
}): MenuValidation {
  const errors: MenuIssue[] = [];
  const warnings: MenuIssue[] = [];
  const items = input.items;

  const core = items.filter((i) => i.role === "core" && !i.isDraft);
  if (core.length > 3) {
    warnings.push({
      code: "too_many_core_tiers",
      message: `The menu has ${core.length} core tiers. More than 3 core choices slows customers down — the ladder works best at 3.`,
    });
  }

  const popular = items.filter((i) => i.isMostPopular);
  if (popular.length > 1) {
    errors.push({
      code: "multiple_most_popular",
      message: `Only one service can be flagged Most Popular; ${popular.length} are flagged.`,
    });
  } else if (popular.length === 0 && core.length > 0) {
    warnings.push({
      code: "no_most_popular",
      message:
        "No core service is flagged Most Popular. Flag the middle tier — that flag is what steers customers to it.",
    });
  }

  const heroes = (input.heroPackageIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (new Set(heroes).size > 1) {
    errors.push({
      code: "multiple_heroes",
      message: "A menu gets exactly one hero deal. Remove the extra hero.",
    });
  }

  if (input.packages && input.catalogById) {
    const packageById = new Map(input.packages.map((p) => [p.id, p]));
    for (const item of items) {
      if (item.role !== "combo" || !item.packageId) continue;
      const pkg = packageById.get(item.packageId);
      if (!pkg) continue;
      const { savings } = comboSavings(pkg, input.catalogById);
      if (savings < 0) {
        warnings.push({
          code: "combo_priced_above_separate",
          message: `"${pkg.name}" is priced above its services bought separately. A combo has to read as a deal.`,
        });
      }
    }
  }

  if (input.catalogById) {
    for (const item of items) {
      if (item.role !== "side" || item.withServicePrice == null) continue;
      const row = item.serviceCatalogId
        ? input.catalogById.get(item.serviceCatalogId)
        : undefined;
      if (row && item.withServicePrice > catalogPrice(row)) {
        warnings.push({
          code: "side_with_service_above_standalone",
          message: `"${row.name}" costs more added to a service than it does alone. The with-service price should be the lower one.`,
        });
      }
    }
  }

  if (items.some((i) => i.isDraft)) {
    warnings.push({
      code: "draft_items_unpriced",
      message:
        "Draft entries have no matching catalog service yet, so they show without a price until they're matched.",
    });
  }

  return { errors, warnings };
}

function bySortOrder(
  a: { sortOrder?: number },
  b: { sortOrder?: number },
): number {
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

/**
 * Resolve a renderable menu from the live catalog + packages.
 * Returns null when the feature is disabled — callers render nothing
 * (current behavior) in that case.
 *
 * - Prices come only from the catalog/package rows passed in.
 * - Inactive catalog services and inactive packages are excluded.
 * - Draft items render with a null price (never an invented one).
 * - `includeDrafts: false` hides drafts (the public surface).
 */
export function resolveMenu(input: {
  settings: MenuSettingsConfig;
  items: readonly MenuItemConfig[];
  catalog: readonly CatalogPriceSource[];
  packages: readonly MenuPackageSource[];
  includeDrafts?: boolean;
}): ResolvedMenu | null {
  if (!input.settings.enabled) return null;
  const includeDrafts = input.includeDrafts ?? true;

  const catalogById = new Map(
    input.catalog
      .filter((row) => row.is_active !== false)
      .map((row) => [row.id, row] as const),
  );
  const packageById = new Map(
    input.packages
      .filter((pkg) => pkg.isActive !== false)
      .map((pkg) => [pkg.id, pkg] as const),
  );

  const core: ResolvedCoreEntry[] = [];
  const combos: ResolvedComboEntry[] = [];
  const sides: ResolvedSideEntry[] = [];

  // Stable sort by the shop's chosen placement order only.
  const sorted = [...input.items].sort(bySortOrder);

  for (const item of sorted) {
    if (item.isDraft && !includeDrafts) continue;

    if (item.role === "combo") {
      const pkg = item.packageId ? packageById.get(item.packageId) : undefined;
      if (!pkg && !item.isDraft) continue;
      const math = pkg ? comboSavings(pkg, catalogById) : null;
      combos.push({
        key: item.id ?? item.packageId ?? item.displayName ?? "combo",
        name: item.displayName || pkg?.name || "Combo",
        description: pkg?.description ?? null,
        isDraft: Boolean(item.isDraft || !pkg),
        packageId: pkg ? pkg.id : null,
        price: math ? math.bundlePrice : null,
        separateTotal: math ? math.separateTotal : null,
        savings: math ? math.savings : null,
        savingsPercent: math ? math.savingsPercent : null,
        includedNames: pkg
          ? pkg.items
              .map((pi) => catalogById.get(pi.serviceCatalogId)?.name)
              .filter((n): n is string => Boolean(n))
          : [],
      });
      continue;
    }

    const row = item.serviceCatalogId
      ? catalogById.get(item.serviceCatalogId)
      : undefined;
    if (!row && !item.isDraft) continue;
    const name = item.displayName || row?.name || "Service";

    if (item.role === "core") {
      core.push({
        key: item.id ?? item.serviceCatalogId ?? name,
        name,
        description: row?.description ?? null,
        isDraft: Boolean(item.isDraft || !row),
        serviceCatalogId: row ? row.id : null,
        price: row ? catalogPrice(row) : null,
        estimatedMinutes:
          row?.estimated_minutes == null ? null : Number(row.estimated_minutes),
        isMostPopular: Boolean(item.isMostPopular),
      });
    } else {
      sides.push({
        key: item.id ?? item.serviceCatalogId ?? name,
        name,
        description: row?.description ?? null,
        isDraft: Boolean(item.isDraft || !row),
        serviceCatalogId: row ? row.id : null,
        standalonePrice: row ? catalogPrice(row) : null,
        withServicePrice:
          item.withServicePrice == null
            ? null
            : roundMoney(finitePrice(item.withServicePrice)),
      });
    }
  }

  let hero: ResolvedHero | null = null;
  const heroPkg = input.settings.heroPackageId
    ? packageById.get(input.settings.heroPackageId)
    : undefined;
  if (heroPkg) {
    const math = comboSavings(heroPkg, catalogById);
    hero = {
      name: heroPkg.name,
      label: input.settings.heroLabel ?? null,
      packageId: heroPkg.id,
      price: math.bundlePrice,
      separateTotal: math.separateTotal,
      savings: math.savings,
    };
  }

  return {
    headline: input.settings.headline ?? null,
    core,
    combos,
    sides,
    hero,
    issues: validateMenuConfig({
      items: input.items,
      heroPackageIds: [input.settings.heroPackageId],
      packages: input.packages,
      catalogById,
    }),
  };
}
