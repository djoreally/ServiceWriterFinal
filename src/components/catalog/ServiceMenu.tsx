/**
 * ServiceMenu — customer-facing render of a shop's Service Menu.
 *
 * Three panels, like a fast-food board: Build Your Service (the core
 * ladder + numbered combos), Choose Your Sides ("while you're there"
 * add-ons), and one hero strip. Purely presentational — it renders the
 * menu resolved by the server from the live catalog, so the prices it
 * shows are the shop's booking prices. Renders nothing when there is no
 * resolved menu (feature off = booking page behaves exactly as before).
 */
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResolvedMenu } from "@/lib/service-menu/menu";
import { fetchPublicServiceMenu } from "@/application/queries/service-menu.query";

function money(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

export function ServiceMenu({ menu }: { menu: ResolvedMenu | null }) {
  if (!menu) return null;
  if (menu.core.length === 0 && menu.combos.length === 0 && menu.sides.length === 0 && !menu.hero) {
    return null;
  }

  return (
    <section aria-label="Service menu" className="mb-6 space-y-4">
      {menu.headline && (
        <h2 className="text-xl font-bold tracking-tight">{menu.headline}</h2>
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
                {menu.core.map((entry, index) => (
                  <li key={entry.key} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                        {entry.name}
                        {entry.isMostPopular && (
                          <Badge className="ml-2" variant="default">
                            Most Popular
                          </Badge>
                        )}
                      </p>
                      {entry.description && (
                        <p className="text-sm text-muted-foreground">{entry.description}</p>
                      )}
                    </div>
                    <span className="font-semibold">{money(entry.price)}</span>
                  </li>
                ))}
              </ol>
            )}

            {menu.combos.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Combos
                </p>
                {menu.combos.map((combo) => (
                  <div key={combo.key} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{combo.name}</p>
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
                  </div>
                ))}
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
                {menu.sides.map((side) => (
                  <li key={side.key} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{side.name}</p>
                      {side.description && (
                        <p className="text-sm text-muted-foreground">{side.description}</p>
                      )}
                    </div>
                    <span className="text-right font-semibold">
                      {side.withServicePrice != null ? (
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
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Hero strip — exactly one deal, full width */}
      {menu.hero && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-lg font-bold">{menu.hero.name}</p>
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
          </CardContent>
        </Card>
      )}
    </section>
  );
}

/**
 * Booking-surface wrapper: loads the public menu for a booking slug and
 * renders it when the shop has enabled one. Any failure or a disabled
 * menu renders nothing — the booking page keeps its current behavior.
 */
export function ServiceMenuSection({ slug }: { slug: string | undefined }) {
  const [menu, setMenu] = useState<ResolvedMenu | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchPublicServiceMenu(slug)
      .then((data) => {
        if (!cancelled) setMenu(data);
      })
      .catch(() => {
        if (!cancelled) setMenu(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return <ServiceMenu menu={menu} />;
}
