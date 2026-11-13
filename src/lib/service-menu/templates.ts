/**
 * Service Menu templates.
 *
 * A template carries STRUCTURE ONLY: entry names, menu roles, combo
 * membership, and which core entry the template suggests flagging Most
 * Popular. It NEVER carries a price — not a service price, not a bundle
 * price, not a with-service price. Each shop's prices come from its own
 * catalog (service_catalog / service_packages) when the template is
 * applied. A unit test enforces the no-prices rule over the whole
 * template object graph.
 *
 * Applying a template maps entries onto the shop's catalog by (loosely
 * normalized) name. Matched entries become real menu placements;
 * unmatched entries become clearly-marked DRAFTS with no price, so the
 * shop can see the intended structure and finish it — the system never
 * invents a service or a price to fill a gap.
 */
import type { CatalogPriceSource, MenuItemConfig, MenuPackageSource, MenuRole } from "./menu";

export interface ServiceMenuTemplateEntry {
  role: MenuRole;
  /** Display name; also the name matched against the shop's catalog. */
  name: string;
  /** For combos: the catalog service names the bundle is made of. */
  memberServiceNames?: string[];
  /** Template suggestion only — the shop can move the flag. */
  suggestMostPopular?: boolean;
}

export interface ServiceMenuTemplate {
  id: string;
  name: string;
  description: string;
  entries: ServiceMenuTemplateEntry[];
}

/**
 * Template #1 — MOMS Mobile Oil Change (the pilot).
 * The 3-tier oil ladder, three named combos, and "while you're there"
 * sides. Names only; MOMS (and every shop after it) prices these from
 * its own catalog.
 */
export const MOMS_MOBILE_OIL_TEMPLATE: ServiceMenuTemplate = {
  id: "moms-mobile-oil",
  name: "Mobile Oil Change (MOMS)",
  description:
    "Three-tier oil ladder, numbered combos, and driveway add-ons — the MOMS Mobile Oil Change menu structure.",
  entries: [
    { role: "core", name: "Full Synthetic Oil Change" },
    { role: "core", name: "Mobil 1 Full Synthetic Oil Change", suggestMostPopular: true },
    { role: "core", name: "European Full Synthetic Oil Change" },
    {
      role: "combo",
      name: "The Essential",
      memberServiceNames: ["Full Synthetic Oil Change"],
    },
    {
      role: "combo",
      name: "The Commuter",
      memberServiceNames: ["Full Synthetic Oil Change", "Tire Rotation"],
    },
    {
      role: "combo",
      name: "The Road Ready",
      memberServiceNames: ["Full Synthetic Oil Change", "Tire Rotation", "Wiper Set"],
    },
    { role: "side", name: "Wiper Set" },
    { role: "side", name: "Engine Air Filter" },
    { role: "side", name: "Cabin Air Filter" },
    {
      role: "combo",
      name: "Both Filters Pair",
      memberServiceNames: ["Engine Air Filter", "Cabin Air Filter"],
    },
    { role: "side", name: "Tire Rotation" },
    { role: "side", name: "Battery Test" },
  ],
};

export const SERVICE_MENU_TEMPLATES: readonly ServiceMenuTemplate[] = [
  MOMS_MOBILE_OIL_TEMPLATE,
];

export function getServiceMenuTemplate(id: string): ServiceMenuTemplate | null {
  return SERVICE_MENU_TEMPLATES.find((t) => t.id === id) ?? null;
}

/**
 * Lowercase, collapse punctuation/space, and strip generic filler words
 * ("replacement", "blades", "service", …) so "Engine Air Filter
 * Replacement" and "Engine Air Filter" normalize to the same key.
 * Matching is then EXACT on the normalized key — deliberately not
 * substring matching: "European Full Synthetic Oil Change" contains
 * "Full Synthetic Oil Change" as a substring but is a different tier,
 * and a wrong-tier match would put the wrong service (and price) on
 * the menu.
 */
export function normalizeServiceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|service|replacement|blades|blade)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findByName<T extends { name: string }>(
  rows: readonly T[],
  name: string,
): T | undefined {
  const target = normalizeServiceName(name);
  if (!target) return undefined;
  return rows.find((row) => normalizeServiceName(row.name) === target);
}

export interface TemplatePlacement extends MenuItemConfig {
  /** For draft combos: catalog ids of the matched member services. */
  memberServiceCatalogIds?: string[];
  /** Template entry this placement came from (for reporting). */
  templateEntryName: string;
}

/**
 * Map a template onto a shop's catalog + packages.
 *
 * - Core/side entries match a catalog service by name.
 * - Combo entries match an existing package by name first; failing
 *   that, if every member service matched the catalog, the placement is
 *   a draft combo carrying the matched member ids (the shop turns it
 *   into a real package, at its own price, in one step).
 * - Anything unmatched is a draft with a display name and NO price.
 */
export function mapTemplateToCatalog(
  template: ServiceMenuTemplate,
  catalog: readonly CatalogPriceSource[],
  packages: readonly MenuPackageSource[],
): TemplatePlacement[] {
  const activeCatalog = catalog.filter((row) => row.is_active !== false);
  const findService = (name: string) => findByName(activeCatalog, name);

  const placements: TemplatePlacement[] = [];
  let sortOrder = 0;

  for (const entry of template.entries) {
    sortOrder += 10;

    if (entry.role === "combo") {
      const pkg = findByName(
        packages.filter((p) => p.isActive !== false),
        entry.name,
      );
      if (pkg) {
        placements.push({
          role: "combo",
          packageId: pkg.id,
          displayName: entry.name,
          isDraft: false,
          sortOrder,
          templateEntryName: entry.name,
        });
        continue;
      }
      const memberIds = (entry.memberServiceNames ?? [])
        .map((n) => findService(n)?.id)
        .filter((id): id is string => Boolean(id));
      const allMatched =
        (entry.memberServiceNames ?? []).length > 0 &&
        memberIds.length === (entry.memberServiceNames ?? []).length;
      placements.push({
        role: "combo",
        packageId: null,
        serviceCatalogId: null,
        displayName: entry.name,
        isDraft: true,
        sortOrder,
        templateEntryName: entry.name,
        memberServiceCatalogIds: allMatched ? memberIds : [],
      });
      continue;
    }

    const service = findService(entry.name);
    placements.push({
      role: entry.role,
      serviceCatalogId: service?.id ?? null,
      packageId: null,
      displayName: entry.name,
      isMostPopular: Boolean(entry.suggestMostPopular && service),
      isDraft: !service,
      sortOrder,
      templateEntryName: entry.name,
    });
  }

  return placements;
}
