/**
 * ServiceMenuCard — the Service Menu builder (Catalog page).
 *
 * A shop turns its existing catalog into a McDonald's-style menu:
 * assign core tiers and sides from the catalog, place packages as
 * combos, pick ONE hero deal, flag ONE Most Popular, and apply a
 * structure-only template (MOMS is template #1). Prices are never typed
 * here for services/packages — they come from the catalog itself; the
 * only price a menu owns is a side's with-service price. Guardrail
 * issues returned by the server (too many tiers, combo priced above
 * separate, …) render inline.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Download, Star, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/error-message";
import {
  fetchServiceMenu,
  updateServiceMenuSettings,
  addServiceMenuItem,
  updateServiceMenuItem,
  removeServiceMenuItem,
  applyServiceMenuTemplate,
  type ServiceMenuBuilderState,
} from "@/application/queries/service-menu.query";
import { fetchCatalogItems, type CatalogItem } from "@/application/queries/service-catalog.query";
import { fetchServicePackages, type ServicePackageRow } from "@/application/queries/packages.query";
import { comboSavings, type MenuPackageSource } from "@/lib/service-menu/menu";
import { ServiceMenu } from "./ServiceMenu";

const selectClass =
  "flex h-9 rounded-md border border-input bg-background px-2 text-sm";

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`;
}

export function ServiceMenuCard({ onRefresh }: { onRefresh?: () => void }) {
  const [state, setState] = useState<ServiceMenuBuilderState | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [packages, setPackages] = useState<ServicePackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [headlineDraft, setHeadlineDraft] = useState("");
  const [sidePrices, setSidePrices] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [menuState, items, pkgs] = await Promise.all([
      fetchServiceMenu(),
      fetchCatalogItems(),
      fetchServicePackages(),
    ]);
    setState(menuState);
    setCatalog(items);
    setPackages(pkgs);
    setHeadlineDraft(menuState?.settings.headline ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => refresh().catch(() => setLoading(false)));
  }, [refresh]);

  const run = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      setBusy(true);
      try {
        await action();
        await refresh();
        onRefresh?.();
        toast({ title: success });
      } catch (error) {
        toast({ title: "Service menu update failed", description: errorMessage(error), variant: "destructive" });
      } finally {
        setBusy(false);
      }
    },
    [refresh, onRefresh],
  );

  const catalogById = useMemo(
    () =>
      new Map(
        catalog.map((item) => [
          item.id,
          { id: item.id, name: item.name, labor_price: item.default_price },
        ]),
      ),
    [catalog],
  );

  const packageSource = useCallback(
    (pkg: ServicePackageRow): MenuPackageSource => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      packagePrice: pkg.package_price,
      isActive: pkg.is_active,
      items: pkg.items.map((item) => ({
        serviceCatalogId: item.service_catalog_id,
        quantity: item.quantity,
        overridePrice: item.override_price,
      })),
    }),
    [],
  );

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="py-6 text-sm text-muted-foreground">Loading service menu…</CardContent>
      </Card>
    );
  }

  const settings = state?.settings ?? { enabled: false, headline: null, heroPackageId: null, heroLabel: null };
  const items = state?.items ?? [];
  const itemByService = new Map(items.filter((i) => i.serviceCatalogId).map((i) => [i.serviceCatalogId as string, i]));
  const itemByPackage = new Map(items.filter((i) => i.packageId).map((i) => [i.packageId as string, i]));
  const drafts = items.filter((i) => i.isDraft);

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Service Menu</CardTitle>
            <CardDescription>
              Your catalog, presented like a fast-food menu — three core tiers, combos,
              “while you&apos;re there” sides, and one hero deal. Prices always come from
              the catalog and packages above, never from a separate list.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="service-menu-enabled" className="text-sm">
              {settings.enabled ? "On" : "Off"}
            </Label>
            <Switch
              id="service-menu-enabled"
              checked={settings.enabled}
              disabled={busy}
              onCheckedChange={(checked) =>
                void run(() => updateServiceMenuSettings({ enabled: checked }), checked ? "Menu is live on your booking page" : "Menu turned off")
              }
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Guardrail issues from the server */}
        {state && (state.issues.errors.length > 0 || state.issues.warnings.length > 0) && (
          <div className="space-y-2">
            {state.issues.errors.map((issue) => (
              <p key={issue.code} className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {issue.message}
              </p>
            ))}
            {state.issues.warnings.map((issue) => (
              <p key={issue.code} className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {issue.message}
              </p>
            ))}
          </div>
        )}

        {/* Headline + template */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Label htmlFor="service-menu-headline">Menu headline</Label>
            <Input
              id="service-menu-headline"
              value={headlineDraft}
              onChange={(e) => setHeadlineDraft(e.target.value)}
              placeholder="e.g. We come to you — pick your service"
              maxLength={200}
            />
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(() => updateServiceMenuSettings({ headline: headlineDraft || null }), "Headline saved")
            }
          >
            Save headline
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              applyServiceMenuTemplate("moms-mobile-oil")
                .then(async (result) => {
                  await refresh();
                  onRefresh?.();
                  toast({
                    title: "MOMS template applied",
                    description: result
                      ? `${result.created.length} entries added${result.skipped.length ? `, ${result.skipped.length} already on the menu` : ""}. Unmatched entries are drafts with no price.`
                      : undefined,
                  });
                })
                .catch((error: unknown) =>
                  toast({ title: "Template failed", description: errorMessage(error), variant: "destructive" }),
                )
                .finally(() => setBusy(false));
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Apply MOMS template
          </Button>
        </div>

        {/* Core tiers & sides from the catalog */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Catalog services — core tiers &amp; sides</h3>
          {catalog.filter((s) => s.is_active).map((service) => {
            const placement = itemByService.get(service.id);
            return (
              <div key={service.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
                <span className="min-w-48 flex-1 text-sm font-medium">
                  {service.name}
                  <span className="ml-2 text-muted-foreground">{money(service.default_price)}</span>
                </span>
                <select
                  aria-label={`Menu role for ${service.name}`}
                  className={selectClass}
                  value={placement ? placement.role : "none"}
                  disabled={busy}
                  onChange={(e) => {
                    const role = e.target.value;
                    if (role === "none") {
                      if (placement?.id) void run(() => removeServiceMenuItem(placement.id as string), "Removed from menu");
                    } else if (placement?.id) {
                      void run(() => updateServiceMenuItem(placement.id as string, { role: role as "core" | "side" }), "Menu updated");
                    } else {
                      void run(() => addServiceMenuItem({ role: role as "core" | "side", service_catalog_id: service.id, sort_order: items.length * 10 + 10 }), "Added to menu");
                    }
                  }}
                >
                  <option value="none">Not on menu</option>
                  <option value="core">Core tier</option>
                  <option value="side">Side (“while you&apos;re there”)</option>
                </select>
                {placement?.role === "core" && (
                  <Button
                    size="sm"
                    variant={placement.isMostPopular ? "default" : "outline"}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => updateServiceMenuItem(placement.id as string, { is_most_popular: !placement.isMostPopular }),
                        placement.isMostPopular ? "Most Popular cleared" : "Flagged Most Popular",
                      )
                    }
                  >
                    <Star className="mr-1 h-4 w-4" /> Most Popular
                  </Button>
                )}
                {placement?.role === "side" && (
                  <span className="flex items-center gap-2">
                    <Input
                      aria-label={`With-service price for ${service.name}`}
                      className="w-28"
                      inputMode="decimal"
                      placeholder="With service $"
                      value={sidePrices[placement.id as string] ?? (placement.withServicePrice?.toString() ?? "")}
                      onChange={(e) => setSidePrices((prev) => ({ ...prev, [placement.id as string]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        const raw = sidePrices[placement.id as string];
                        const value = raw === "" || raw === undefined ? null : Number(raw);
                        void run(
                          () => updateServiceMenuItem(placement.id as string, { with_service_price: value }),
                          "With-service price saved",
                        );
                      }}
                    >
                      Save
                    </Button>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Combos from packages + hero picker */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Combos — your packages</h3>
          {packages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No packages yet. Create a package above and it can be placed here as a combo.
            </p>
          )}
          {packages.map((pkg) => {
            const placement = itemByPackage.get(pkg.id);
            const savings = comboSavings(packageSource(pkg), catalogById);
            const isHero = settings.heroPackageId === pkg.id;
            return (
              <div key={pkg.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
                <span className="min-w-48 flex-1 text-sm font-medium">
                  {pkg.name}
                  <span className="ml-2 text-muted-foreground">{money(pkg.package_price)}</span>
                  {savings.savings > 0 && (
                    <span className="ml-2 text-green-700">saves {money(savings.savings)} vs. separate</span>
                  )}
                  {isHero && <Badge className="ml-2">Hero deal</Badge>}
                </span>
                <Button
                  size="sm"
                  variant={placement ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => {
                    if (placement?.id) {
                      void run(() => removeServiceMenuItem(placement.id as string), "Combo removed from menu");
                    } else {
                      void run(() => addServiceMenuItem({ role: "combo", package_id: pkg.id, sort_order: items.length * 10 + 10 }), "Combo added to menu");
                    }
                  }}
                >
                  {placement ? "On menu" : "Add as combo"}
                </Button>
                <Button
                  size="sm"
                  variant={isHero ? "default" : "outline"}
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => updateServiceMenuSettings({ hero_package_id: isHero ? null : pkg.id }),
                      isHero ? "Hero deal cleared" : "Set as the hero deal",
                    )
                  }
                >
                  Hero
                </Button>
              </div>
            );
          })}
        </div>

        {/* Drafts from templates */}
        {drafts.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Draft entries — no catalog match yet, no price shown</h3>
            {drafts.map((draft) => (
              <div key={draft.id ?? draft.displayName} className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2">
                <span className="flex-1 text-sm font-medium">
                  {draft.displayName}
                  <Badge variant="secondary" className="ml-2">{draft.role} · draft</Badge>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || !draft.id}
                  onClick={() => draft.id && void run(() => removeServiceMenuItem(draft.id as string), "Draft removed")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              Add a matching service (or package) to the catalog, then re-apply the template — or
              place the real service on the menu and delete the draft.
            </p>
          </div>
        )}

        {/* Live preview (resolved from the catalog, exactly as customers see it) */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Preview</h3>
          <ServiceMenu menu={state?.menu ?? null} />
        </div>
      </CardContent>
    </Card>
  );
}
