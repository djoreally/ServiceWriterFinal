import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { Sparkles, Save, Camera, Droplets, Zap, Umbrella, FileCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchDetailingPricingRules } from "@/application/queries/detailing-pricing.query";
import { fetchCatalogItems, type CatalogItem } from "@/application/queries/service-catalog.query";
import { saveDetailingPricingRulesForService } from "@/application/commands/detailing-pricing.command";
import { defaultDetailingRule, type DetailingCondition, type DetailingPricingRule, type DetailingSize } from "@/lib/detailing-pricing";
import { toast } from "@/components/ui/sonner";

const SIZES: DetailingSize[] = ["compact", "midsize", "large", "oversize"];
const CONDITIONS: DetailingCondition[] = ["light", "moderate", "heavy"];

function buildRules(rows: DetailingPricingRule[], serviceCatalogId: string | null) {
  return SIZES.flatMap((size) => CONDITIONS.map((condition) => rows.find((row) => row.serviceCatalogId === serviceCatalogId && row.sizeTier === size && row.condition === condition) || { ...defaultDetailingRule(size, condition), serviceCatalogId }));
}

export function DetailingPricingRulesCard() {
  const [rules, setRules] = useState<DetailingPricingRule[]>([]);
  const [services, setServices] = useState<CatalogItem[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("__generic__");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const detailingServices = useMemo(() => services.filter((service) => service.service_vertical === "detailing" && service.is_active), [services]);
  const selectedServiceIdValue = selectedServiceId === "__generic__" ? null : selectedServiceId;
  const selectedService = detailingServices.find((service) => service.id === selectedServiceId);

  useEffect(() => {
    Promise.all([fetchDetailingPricingRules(), fetchCatalogItems()]).then(([pricingRules, catalog]) => {
      setRules(pricingRules);
      setServices(catalog);
    }).catch((error: unknown) => toast.error("Could not load detailing configuration", { description: errorMessage(error, "The backend did not return detailing pricing rules.") })).finally(() => setLoading(false));
  }, []);

  const visibleRules = buildRules(rules, selectedServiceIdValue);
  const update = (index: number, patch: Partial<DetailingPricingRule>) => {
    const target = visibleRules[index];
    setRules((current) => {
      const withoutTarget = current.filter((rule) => !(rule.serviceCatalogId === selectedServiceIdValue && rule.sizeTier === target.sizeTier && rule.condition === target.condition));
      return [...withoutTarget, { ...target, ...patch, serviceCatalogId: selectedServiceIdValue }];
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveDetailingPricingRulesForService(selectedServiceIdValue, visibleRules);
      setRules((current) => [...current.filter((rule) => rule.serviceCatalogId !== selectedServiceIdValue), ...visibleRules]);
      toast.success(`${selectedService ? selectedService.name : "Generic defaults"} detailing profile saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save detailing rules");
    } finally {
      setSaving(false);
    }
  };

  return <Card className="mb-6">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" />Detailing & car wash pricing</CardTitle>
      <p className="text-sm text-muted-foreground">Configure assessment, pricing, duration, and mobile-site requirements by service. Generic defaults apply when a service profile is not customized.</p>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4 rounded-xl border bg-muted/20 p-4">
        <div><Label>Configuration profile</Label><Select value={selectedServiceId} onValueChange={setSelectedServiceId}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__generic__">Generic detailing defaults</SelectItem>{detailingServices.map((service) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="rounded-lg bg-background p-3 text-sm"><p className="font-medium">{selectedService ? selectedService.name : "Generic fallback"}</p><p className="text-xs text-muted-foreground">{selectedService ? `Base price $${selectedService.default_price.toFixed(2)} · ${selectedService.estimated_duration || 0} min` : "Used by detailing services without a custom profile"}</p></div>
      </div>

      {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading detailing profiles…</p> : <>
        <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="p-2">Vehicle size</th><th className="p-2">Condition</th><th className="p-2">Price ×</th><th className="p-2">Time ×</th><th className="p-2">Flat fee</th><th className="p-2">Assessment requirements</th></tr></thead><tbody>{visibleRules.map((rule, index) => <tr key={`${rule.sizeTier}-${rule.condition}`} className="border-b last:border-0"><td className="p-2 font-medium capitalize">{rule.sizeTier}</td><td className="p-2 capitalize">{rule.condition}</td><td className="p-2"><Input className="h-9 w-20" type="number" min="0.5" max="5" step="0.05" value={rule.priceMultiplier} onChange={(event) => update(index, { priceMultiplier: Number(event.target.value) })} /></td><td className="p-2"><Input className="h-9 w-20" type="number" min="0.5" max="5" step="0.05" value={rule.durationMultiplier} onChange={(event) => update(index, { durationMultiplier: Number(event.target.value) })} /></td><td className="p-2"><Input className="h-9 w-24" type="number" min="0" step="1" value={rule.flatFee} onChange={(event) => update(index, { flatFee: Number(event.target.value) })} /></td><td className="p-2"><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs"><label className="flex items-center gap-1"><Checkbox checked={rule.photoRequired} onCheckedChange={(value) => update(index, { photoRequired: value === true })} /><Camera className="h-3 w-3" />Photo</label><label className="flex items-center gap-1"><Checkbox checked={rule.quoteRequired} onCheckedChange={(value) => update(index, { quoteRequired: value === true })} /><FileCheck className="h-3 w-3" />Review</label><label className="flex items-center gap-1"><Checkbox checked={rule.requiresWater} onCheckedChange={(value) => update(index, { requiresWater: value === true })} /><Droplets className="h-3 w-3" />Water</label><label className="flex items-center gap-1"><Checkbox checked={rule.requiresPower} onCheckedChange={(value) => update(index, { requiresPower: value === true })} /><Zap className="h-3 w-3" />Power</label><label className="flex items-center gap-1"><Checkbox checked={rule.requiresCoveredArea} onCheckedChange={(value) => update(index, { requiresCoveredArea: value === true })} /><Umbrella className="h-3 w-3" />Cover</label></div></td></tr>)}</tbody></table></div>
        <div className="rounded-xl border bg-muted/20 p-4"><p className="text-sm font-medium">Customer price preview</p><p className="mt-1 text-xs text-muted-foreground">For a $100 base service, the selected profile produces these starting estimates. Heavy and oversized work can remain quote-only.</p><div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">{visibleRules.filter((rule) => rule.condition === "light").map((rule) => <div key={rule.sizeTier} className="rounded-lg bg-background p-3"><p className="text-xs capitalize text-muted-foreground">{rule.sizeTier}</p><p className="font-semibold">${(100 * rule.priceMultiplier + rule.flatFee).toFixed(2)}</p><p className="text-[11px] text-muted-foreground">starting estimate</p></div>)}</div></div>
        <div className="flex justify-end"><Button disabled={saving} onClick={save}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save detailing profile"}</Button></div>
      </>}
    </CardContent>
  </Card>;
}
