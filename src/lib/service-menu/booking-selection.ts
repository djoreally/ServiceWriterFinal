/**
 * Service Menu → booking-selection adapter.
 *
 * Pure functions that translate menu clicks into the public booking
 * flow's EXISTING selection state — the `{ services, package }` shape
 * ServiceSelectionStep reads and writes for its own service rows and
 * package cards (`VehicleServiceSelection`). No parallel booking state
 * is created: the step commits the returned selection through its
 * normal `onVehicleServiceChange` pathway, so pricing
 * (`useBookingPricing`), draft persistence, and submission
 * (`useBookingSubmit`) all see exactly what they would see if the
 * customer had used the plain catalog list.
 *
 * The functions are generic over the caller's service/package object
 * shapes (the step's `ServiceCatalogItem`/`ServicePackage` and the
 * booking state's `SelectedBookingService`/`SelectedBookingPackage` are
 * structural twins) — only `id` and `default_price` are read.
 *
 * Toggle semantics mirror ServiceSelectionStep's own handlers:
 * - Toggling a service clears any selected package.
 * - Selecting a package clears individual services; selecting the same
 *   package again deselects it.
 *
 * With-service pricing for sides:
 * A menu side may carry a `withServicePrice` — its price when added
 * alongside a real service. The booking pathway prices (and submits) the
 * `default_price` of the service objects stored in the selection, so the
 * honest way to honor the menu price is to store the side's service
 * object at the effective price:
 * - the with-service price when the SAME selection also holds a package
 *   or any service that is not itself a with-service-priced side;
 * - the catalog (standalone) price otherwise.
 * `repriceSides` re-applies that rule to a whole selection, so
 * qualification changes made through the plain catalog list
 * (adding/removing a core service) reprice menu sides too — the charged
 * price can never silently diverge from the menu's rule. The standalone
 * price is always the booking catalog object's own `default_price` —
 * the exact value the normal selector would charge — supplied by the
 * caller from its catalog list. Nothing here mutates catalog data or
 * invents a price: the only prices used are the catalog price and the
 * shop-configured with-service price from the menu itself.
 */
import type { ResolvedMenu } from "./menu";

export interface SelectionServiceLike {
  id: string;
  default_price: number;
}

export interface SelectionPackageLike {
  id: string;
}

export interface SelectionLike<
  S extends SelectionServiceLike,
  P extends SelectionPackageLike,
> {
  services: S[];
  package: P | null;
}

/** serviceCatalogId → with-service price, for sides that carry one. */
export type MenuSidePriceMap = ReadonlyMap<string, number>;

/**
 * Extract the with-service price map from a resolved menu. Sides without
 * a target id (drafts), without a with-service price, or whose
 * with-service price is not actually lower than standalone are excluded
 * — they behave as ordinary services.
 */
export function menuSidePriceMap(
  menu: ResolvedMenu | null | undefined,
): MenuSidePriceMap {
  const map = new Map<string, number>();
  if (!menu) return map;
  for (const side of menu.sides) {
    if (
      side.serviceCatalogId &&
      side.withServicePrice != null &&
      side.standalonePrice != null &&
      side.withServicePrice < side.standalonePrice
    ) {
      map.set(side.serviceCatalogId, side.withServicePrice);
    }
  }
  return map;
}

/**
 * Does this selection qualify for with-service side pricing? A package
 * always qualifies. Otherwise any selected service that is not itself a
 * with-service-priced side qualifies (two discounted sides alone do not
 * discount each other).
 */
export function selectionQualifiesForWithService(
  selection: SelectionLike<SelectionServiceLike, SelectionPackageLike>,
  sidePrices: MenuSidePriceMap,
): boolean {
  if (selection.package) return true;
  return selection.services.some((service) => !sidePrices.has(service.id));
}

/**
 * Reprice the menu sides inside a selection per the qualification rule.
 * `catalogObjects` is the caller's booking catalog list; it supplies the
 * pristine standalone price when a previously discounted side must be
 * restored. Returns the SAME selection object when nothing changes
 * (including when the menu has no priced sides), so callers can run it
 * on every selection commit unconditionally.
 */
export function repriceSides<
  S extends SelectionServiceLike,
  P extends SelectionPackageLike,
>(
  selection: SelectionLike<S, P>,
  catalogObjects: readonly S[],
  sidePrices: MenuSidePriceMap,
): SelectionLike<S, P> {
  if (sidePrices.size === 0) return selection;
  if (!selection.services.some((service) => sidePrices.has(service.id))) {
    return selection;
  }
  const qualified = selectionQualifiesForWithService(selection, sidePrices);
  const catalogById = new Map(catalogObjects.map((s) => [s.id, s]));
  let changed = false;
  const services = selection.services.map((service) => {
    const withServicePrice = sidePrices.get(service.id);
    if (withServicePrice == null) return service;
    const standalone = catalogById.get(service.id)?.default_price;
    const target = qualified
      ? withServicePrice
      : (standalone ?? service.default_price);
    if (service.default_price === target) return service;
    changed = true;
    return { ...service, default_price: target };
  });
  return changed ? { ...selection, services } : selection;
}

/**
 * Toggle a service in a selection, mirroring ServiceSelectionStep:
 * any selected package is cleared, and menu sides end up priced by the
 * qualification rule evaluated against the resulting selection.
 *
 * `catalogService` must be the booking catalog's own object for the
 * service (its `default_price` is the standalone price). `catalogObjects`
 * is the full catalog list, used to restore standalone prices of other
 * sides when this toggle changes their qualification.
 */
export function toggleServiceInSelection<
  S extends SelectionServiceLike,
  P extends SelectionPackageLike,
>(
  selection: SelectionLike<S, P>,
  catalogService: S,
  catalogObjects: readonly S[],
  sidePrices: MenuSidePriceMap,
): SelectionLike<S, P> {
  const exists = selection.services.some((s) => s.id === catalogService.id);
  const toggled: SelectionLike<S, P> = {
    services: exists
      ? selection.services.filter((s) => s.id !== catalogService.id)
      : [...selection.services, catalogService],
    package: null,
  };
  return repriceSides(toggled, catalogObjects, sidePrices);
}

/**
 * Toggle a package in a selection, mirroring ServiceSelectionStep:
 * individual services are cleared; the same package toggles off.
 */
export function togglePackageInSelection<
  S extends SelectionServiceLike,
  P extends SelectionPackageLike,
>(
  selection: SelectionLike<S, P>,
  pkg: P | null,
): SelectionLike<S, P> {
  if (!pkg) return selection;
  return {
    services: [],
    package: selection.package?.id === pkg.id ? null : pkg,
  };
}

/** Is a core/side menu entry currently selected in this selection? */
export function isServiceEntrySelected(
  serviceCatalogId: string | null,
  selection: SelectionLike<SelectionServiceLike, SelectionPackageLike>,
): boolean {
  if (!serviceCatalogId) return false;
  return selection.services.some((s) => s.id === serviceCatalogId);
}

/** Is a combo/hero menu entry (a package) currently selected? */
export function isPackageEntrySelected(
  packageId: string | null,
  selection: SelectionLike<SelectionServiceLike, SelectionPackageLike>,
): boolean {
  if (!packageId) return false;
  return selection.package?.id === packageId;
}
