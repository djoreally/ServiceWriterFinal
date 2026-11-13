/**
 * ServiceMenu — customer-facing render of a shop's Service Menu.
 *
 * Three panels, like a fast-food board: Build Your Service (the core
 * ladder + numbered combos), Choose Your Sides ("while you're there"
 * add-ons), and one hero strip. It renders the menu resolved by the
 * server from the live catalog, so the prices it shows are the shop's
 * booking prices. Renders nothing when there is no resolved menu
 * (feature off = booking page behaves exactly as before).
 *
 * Two modes:
 * - Presentational (default): just the board. Used for previews.
 * - Interactive: when `selection` controls are supplied, entries that
 *   map to a real catalog service / package become toggle buttons whose
 *   pressed state reflects the caller's actual booking selection. The
 *   component owns no selection state — clicks report the entry's
 *   target id and the caller (the booking step) applies its own
 *   selection pathway. Draft entries have no target id and stay
 *   non-interactive in both modes.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ResolvedMenu } from "@/lib/service-menu/menu";
import { usePublicServiceMenu } from "@/hooks/usePublicServiceMenu";

function money(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

/** Interactive wiring supplied by the booking step. */
export interface ServiceMenuSelectionControls {
  /** Catalog ids of the services selected for the current target. */
  selectedServiceIds: ReadonlySet<string>;
  /** Package id currently selected for the current target, if any. */
  selectedPackageId: string | null;
  /**
   * Whether the current selection qualifies sides for their
   * with-service price (a package or a non-side service is selected).
   * Drives the effective price shown on a selected side.
   */
  withServiceQualified: boolean;
  onToggleService: (serviceCatalogId: string) => void;
  onTogglePackage: (packageId: string) => void;
}

export interface ServiceMenuProps {
  menu: ResolvedMenu | null;
  selection?: ServiceMenuSelectionControls;
  /** e.g. the vehicle menu clicks apply to, in multi-vehicle bookings. */
  targetLabel?: string | null;
}

const interactiveRowClass = (selected: boolean) =>
  cn(
    "flex w-full items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors",
    "hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-primary bg-primary/5 ring-1 ring-primary"
      : "border-transparent",
  );

export function ServiceMenu({ menu, selection, targetLabel }: ServiceMenuProps) {
  if (!menu) return null;
  if (menu.core.length === 0 && menu.combos.length === 0 && menu.sides.length === 0 && !menu.hero) {
    return null;
  }

  const interactive = Boolean(selection);

  return (
    <section aria-label="Service menu" className="mb-6 space-y-4">
      {menu.headline && (
        <h2 className="text-xl font-bold tracking-tight">{menu.headline}</h2>
      )}
      {targetLabel && (
        <p className="text-sm text-muted-foreground">
          Adding services for: <span className="font-medium text-foreground">{targetLabel}</span>
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Panel 1 — Build Your Service */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Build Your Service</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {menu.core.length > 0 && (
              <ol className="space-y-3">
                {menu.core.map((entry, index) => {
                  const selected = Boolean(
                    entry.serviceCatalogId &&
                      selection?.selectedServiceIds.has(entry.serviceCatalogId),
                  );
                  const content = (
                    <>
                      <div>
                        <p className="font-medium">
                          <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                          {entry.name}
                          {entry.isMostPopular && (
                            <Badge className="ml-2" variant="default">
                              Most Popular
                            </Badge>
                          )}
                          {interactive && selected && (
                            <Badge className="ml-2" variant="secondary">
                              Added
                            </Badge>
                          )}
                        </p>
                        {entry.description && (
                          <p className="text-sm text-muted-foreground">{entry.description}</p>
                        )}
                      </div>
                      <span className="font-semibold">{money(entry.price)}</span>
                    </>
                  );
                  return (
                    <li key={entry.key}>
                      {interactive && entry.serviceCatalogId ? (
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => selection?.onToggleService(entry.serviceCatalogId as string)}
                          className={interactiveRowClass(selected)}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="flex items-start justify-between gap-3">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            {menu.combos.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Combos
                </p>
                {menu.combos.map((combo) => {
                  const selected = Boolean(
                    combo.packageId && selection?.selectedPackageId === combo.packageId,
                  );
                  const content = (
                    <>
                      <div>
                        <p className="font-medium">
                          {combo.name}
                          {interactive && selected && (
                            <Badge className="ml-2" variant="secondary">
                              Added
                            </Badge>
                          )}
                        </p>
                        {combo.includedNames.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            {combo.includedNames.join(" + ")}
                          </p>
                        )}
                        {combo.savings != null && combo.savings > 0 && (
                          <p className="text-sm font-medium text-green-700">
                            Save {money(combo.savings)} vs. separate
                          </p>
                        )}
                      </div>
                      <span className="font-semibold">{money(combo.price)}</span>
                    </>
                  );
                  return interactive && combo.packageId ? (
                    <button
                      key={combo.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selection?.onTogglePackage(combo.packageId as string)}
                      className={interactiveRowClass(selected)}
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={combo.key} className="flex items-start justify-between gap-3">
                      {content}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Panel 2 — Choose Your Sides */}
        {menu.sides.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Choose Your Sides</CardTitle>
              <p className="text-sm text-muted-foreground">
                While we&apos;re there — add these to any service.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {menu.sides.map((side) => {
                  const selected = Boolean(
                    side.serviceCatalogId &&
                      selection?.selectedServiceIds.has(side.serviceCatalogId),
                  );
                  // A selected side shows the price it is actually being
                  // charged at: the with-service price only while the
                  // selection qualifies for it.
                  const effectivePrice =
                    interactive && selected
                      ? selection?.withServiceQualified && side.withServicePrice != null
                        ? side.withServicePrice
                        : side.standalonePrice
                      : null;
                  const content = (
                    <>
                      <div>
                        <p className="font-medium">
                          {side.name}
                          {interactive && selected && (
                            <Badge className="ml-2" variant="secondary">
                              Added
                            </Badge>
                          )}
                        </p>
                        {side.description && (
                          <p className="text-sm text-muted-foreground">{side.description}</p>
                        )}
                      </div>
                      <span className="text-right font-semibold">
                        {effectivePrice != null ? (
                          <>
                            {money(effectivePrice)}
                            <span className="block text-xs font-normal text-muted-foreground">
                              {selection?.withServiceQualified && side.withServicePrice != null
                                ? "with your service"
                                : "alone price"}
                            </span>
                          </>
                        ) : side.withServicePrice != null ? (
                          <>
                            {money(side.withServicePrice)}
                            {side.standalonePrice != null &&
                              side.standalonePrice !== side.withServicePrice && (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {money(side.standalonePrice)} alone
                                </span>
                              )}
                          </>
                        ) : (
                          money(side.standalonePrice)
                        )}
                      </span>
                    </>
                  );
                  return (
                    <li key={side.key}>
                      {interactive && side.serviceCatalogId ? (
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => selection?.onToggleService(side.serviceCatalogId as string)}
                          className={interactiveRowClass(selected)}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className="flex items-start justify-between gap-3">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Hero strip — exactly one deal, full width */}
      {menu.hero && (
        <Card
          className={cn(
            "border-primary bg-primary/5",
            interactive &&
              selection?.selectedPackageId === menu.hero.packageId &&
              "ring-1 ring-primary",
          )}
        >
          <CardContent className="py-4">
            {(() => {
              const selected = selection?.selectedPackageId === menu.hero.packageId;
              const content = (
                <>
                  <div>
                    <p className="text-lg font-bold">
                      {menu.hero.name}
                      {interactive && selected && (
                        <Badge className="ml-2 align-middle" variant="secondary">
                          Added
                        </Badge>
                      )}
                    </p>
                    {menu.hero.label && (
                      <p className="text-sm text-muted-foreground">{menu.hero.label}</p>
                    )}
                    {menu.hero.savings != null && menu.hero.savings > 0 && (
                      <p className="text-sm font-medium text-green-700">
                        Save {money(menu.hero.savings)} vs. separate
                      </p>
                    )}
                  </div>
                  <span className="text-2xl font-bold">{money(menu.hero.price)}</span>
                </>
              );
              return interactive ? (
                <button
                  type="button"
                  aria-pressed={Boolean(selected)}
                  onClick={() => selection?.onTogglePackage(menu.hero.packageId)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {content}
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">{content}</div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/**
 * Booking-surface wrapper: loads the public menu for a booking slug and
 * renders it (presentational) when the shop has enabled one.
 */
export function ServiceMenuSection({ slug }: { slug: string | undefined }) {
  const menu = usePublicServiceMenu(slug);
  return <ServiceMenu menu={menu} />;
}
