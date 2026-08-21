import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@packages/auth";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Calculator, Loader2, Save, Search, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchVehicleRepairs, type RepairItem } from "@/application/queries/vehicle-repairs.query";
import {
  priceJobFromRepair,
  type PricingTier,
  type ShopPricingDefaults,
} from "@/domain/pricing/repair-estimate";
import { fetchShopPricingDefaults, saveShopPricingDefaults } from "@/application/queries/shop-pricing.query";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);

export default function JobPricingTool() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [defaults, setDefaults] = useState<ShopPricingDefaults | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);

  const [vin, setVin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repairs, setRepairs] = useState<RepairItem[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<RepairItem | null>(null);
  const [tier, setTier] = useState<PricingTier>("independent");
  const [hoursOverride, setHoursOverride] = useState("");
  const [partsOverride, setPartsOverride] = useState("");

  useEffect(() => {
    if (!userId) return;
    void fetchShopPricingDefaults(userId).then(setDefaults);
  }, [userId]);

  const lookup = useCallback(async () => {
    const clean = vin.replace(/\s/g, "").toUpperCase();
    if (clean.length !== 17) {
      setError("Enter a valid 17-character VIN.");
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const response = await fetchVehicleRepairs(clean, userId ?? undefined);
      setRepairs(response.repair ?? []);
      if (!response.repair?.length) setError("No market repair records exist for this vehicle yet.");
    } catch (err) {
      setRepairs([]);
      setError((err as Error)?.message || "Failed to load market pricing.");
    } finally {
      setLoading(false);
    }
  }, [vin, userId]);

  const price = useMemo(() => {
    if (!selected || !defaults) return null;
    return priceJobFromRepair(selected, tier, defaults, {
      laborHours: hoursOverride ? Number(hoursOverride) : undefined,
      partsCost: partsOverride ? Number(partsOverride) : undefined,
    });
  }, [selected, defaults, tier, hoursOverride, partsOverride]);

  const filtered = repairs.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()));

  const handleSaveDefaults = async () => {
    if (!userId || !defaults) return;
    setSavingDefaults(true);
    const { error: saveError } = await saveShopPricingDefaults(userId, defaults);
    setSavingDefaults(false);
    if (saveError) toast.error("Could not save pricing defaults");
    else toast.success("Pricing defaults saved");
  };

  const setDefaultField = (field: keyof ShopPricingDefaults, value: string) =>
    setDefaults((prev) => (prev ? { ...prev, [field]: Number(value) || 0 } : prev));

  return (
    <AppLayout title="Job Pricing">
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-md bg-primary/10 p-3">
          <Calculator className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Job Pricing</h1>
          <p className="text-sm text-muted-foreground">
            Turn market labor hours and part costs into your own price using your labor rate and markup.
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your pricing defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="rate">Labor rate ($/hr)</Label>
            <Input
              id="rate"
              type="number"
              min={0}
              value={defaults?.laborRate ?? ""}
              onChange={(e) => setDefaultField("laborRate", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="markup">Parts markup (%)</Label>
            <Input
              id="markup"
              type="number"
              min={0}
              value={defaults?.partsMarkupPercent ?? ""}
              onChange={(e) => setDefaultField("partsMarkupPercent", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplies">Shop supplies (%)</Label>
            <Input
              id="supplies"
              type="number"
              min={0}
              value={defaults?.shopSuppliesPercent ?? ""}
              onChange={(e) => setDefaultField("shopSuppliesPercent", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="minhours">Minimum labor hours</Label>
            <Input
              id="minhours"
              type="number"
              step="0.1"
              min={0}
              value={defaults?.minLaborHours ?? ""}
              onChange={(e) => setDefaultField("minLaborHours", e.target.value)}
            />
          </div>
          <div className="sm:col-span-4">
            <Button onClick={handleSaveDefaults} disabled={savingDefaults || !defaults}>
              {savingDefaults ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price a job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Enter 17-character VIN"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              maxLength={17}
            />
            <Button onClick={lookup} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Look up repairs
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {repairs.length > 0 && (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Input
                  placeholder="Filter repairs"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="sm:max-w-xs"
                />
                <Tabs value={tier} onValueChange={(v) => setTier(v as PricingTier)}>
                  <TabsList>
                    <TabsTrigger value="independent">Independent</TabsTrigger>
                    <TabsTrigger value="dealer">Dealer</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="max-h-64 space-y-2 overflow-y-auto">
                {filtered.map((repair) => (
                  <button
                    key={repair.title}
                    type="button"
                    onClick={() => {
                      setSelected(repair);
                      setHoursOverride("");
                      setPartsOverride("");
                    }}
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      selected?.title === repair.title ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                    }`}
                  >
                    <p className="text-sm font-semibold text-foreground">{repair.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{repair.description}</p>
                  </button>
                ))}
                {filtered.length === 0 && <p className="text-sm text-muted-foreground">No repairs match that filter.</p>}
              </div>
            </>
          )}

          {selected && price && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="font-semibold text-foreground">{selected.title}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="hours">Labor hours (override)</Label>
                  <Input
                    id="hours"
                    type="number"
                    step="0.1"
                    placeholder={String(price.laborHours)}
                    value={hoursOverride}
                    onChange={(e) => setHoursOverride(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="parts">Parts cost (override)</Label>
                  <Input
                    id="parts"
                    type="number"
                    step="1"
                    placeholder={String(price.market.partAvg)}
                    value={partsOverride}
                    onChange={(e) => setPartsOverride(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1 text-sm">
                <Row label={`Labor (${price.laborHours}h)`} value={fmt(price.laborTotal)} />
                <Row label="Parts (with markup)" value={fmt(price.partsTotal)} />
                {price.shopSupplies > 0 && <Row label="Shop supplies" value={fmt(price.shopSupplies)} />}
                <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold text-foreground">
                  <span>Your price</span>
                  <span>{fmt(price.total)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  Market {tier} average: <strong className="text-foreground">{fmt(price.market.totalAvg)}</strong> (
                  {fmt(price.market.totalLow)}–{fmt(price.market.totalHigh)})
                </span>
                {price.position && (
                  <Badge variant={price.position.label === "over" ? "destructive" : "secondary"}>
                    {Math.abs(price.position.percent)}% {price.position.label} market
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
