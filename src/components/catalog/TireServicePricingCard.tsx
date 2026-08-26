import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "@/lib/error-message";
import { CircleGauge, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchCatalogItems, type CatalogItem } from "@/application/queries/service-catalog.query";
import { fetchTireServicePricingRules } from "@/application/queries/tire-pricing.query";
import { saveTireServicePricingRule } from "@/application/commands/tire-pricing.command";
import { defaultTirePricingRule, type TireServicePricingRule } from "@/lib/tire-pricing";
import { toast } from "@/components/ui/sonner";

const intents = [
  { value: "replacement", label: "Replacement / installation" },
  { value: "rotation", label: "Rotation" },
  { value: "repair", label: "Repair / patch" },
  { value: "balance", label: "Balancing" },
  { value: "tpms", label: "TPMS / sensor" },
  { value: "alignment", label: "Alignment" },
  { value: "wheel_service", label: "Wheel service" },
];

export function TireServicePricingCard() {
  const [services, setServices] = useState<CatalogItem[]>([]);
  const [rules, setRules] = useState<TireServicePricingRule[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [rule, setRule] = useState<TireServicePricingRule | null>(null);
  const [saving, setSaving] = useState(false);

  const tireServices = useMemo(() => services.filter((service) => service.service_vertical === "tires" && service.is_active), [services]);

  useEffect(() => {
    Promise.all([fetchCatalogItems(), fetchTireServicePricingRules()]).then(([catalog, pricing]) => {
      setServices(catalog);
      setRules(pricing);
      const first = catalog.find((service) => service.service_vertical === "tires" && service.is_active);
      if (first) setSelectedId(first.id);
    }).catch((error: unknown) => toast.error("Could not load tire pricing configuration", { description: errorMessage(error, "The backend did not return tire pricing rules.") }));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setRule(rules.find((item) => item.serviceCatalogId === selectedId) || defaultTirePricingRule(selectedId));
  }, [rules, selectedId]);

  const selectedService = tireServices.find((service) => service.id === selectedId);
  const update = (patch: Partial<TireServicePricingRule>) => setRule((current) => current ? { ...current, ...patch } : current);

  const save = async () => {
    if (!rule) return;
    setSaving(true);
    try {
      await saveTireServicePricingRule(rule);
      setRules((current) => [...current.filter((item) => item.serviceCatalogId !== rule.serviceCatalogId), rule]);
      toast.success(`${selectedService?.name || "Tire service"} pricing saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save tire pricing");
    } finally {
      setSaving(false);
    }
  };

  return <Card className="mb-6"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><CircleGauge className="h-5 w-5 text-primary" />Tires & Wheels pricing</CardTitle><p className="text-sm text-muted-foreground">Separate tire inventory cost from installation and add-ons. Configure each tire service intent independently.</p></CardHeader><CardContent className="space-y-5">{tireServices.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center"><p className="font-medium">No active tire services yet</p><p className="mt-1 text-sm text-muted-foreground">Create a service and set its vertical to Tires & Wheels to configure pricing here.</p></div> : <><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="space-y-2"><Label>Tire service</Label><Select value={selectedId} onValueChange={setSelectedId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{tireServices.map((service) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}</SelectContent></Select></div><div className="rounded-lg bg-muted/30 p-3 text-sm"><p className="font-medium">{selectedService?.name}</p><p className="text-xs text-muted-foreground">{intents.find((item) => item.value === selectedService?.service_intent)?.label || "Choose the service intent in the catalog editor"}</p></div></div>{rule && <><div className="grid grid-cols-2 md:grid-cols-5 gap-3"><div className="space-y-1"><Label className="text-xs">Installation / tire</Label><Input type="number" min="0" step="1" value={rule.baseInstallationPrice} onChange={(event) => update({ baseInstallationPrice: Number(event.target.value) })} /></div><div className="space-y-1"><Label className="text-xs">Mount + balance</Label><Input type="number" min="0" step="1" value={rule.mountBalancePrice} onChange={(event) => update({ mountBalancePrice: Number(event.target.value) })} /></div><div className="space-y-1"><Label className="text-xs">TPMS / tire</Label><Input type="number" min="0" step="1" value={rule.tpmsServicePrice} onChange={(event) => update({ tpmsServicePrice: Number(event.target.value) })} /></div><div className="space-y-1"><Label className="text-xs">Disposal / tire</Label><Input type="number" min="0" step="1" value={rule.disposalPrice} onChange={(event) => update({ disposalPrice: Number(event.target.value) })} /></div><div className="space-y-1"><Label className="text-xs">Alignment</Label><Input type="number" min="0" step="1" value={rule.alignmentPrice} onChange={(event) => update({ alignmentPrice: Number(event.target.value) })} /></div></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3"><div className="space-y-1"><Label className="text-xs">Minimum tires</Label><Input type="number" min="1" max="8" value={rule.minimumQuantity} onChange={(event) => update({ minimumQuantity: Number(event.target.value) })} /></div><div className="space-y-1"><Label className="text-xs">Maximum tires</Label><Input type="number" min="1" max="8" value={rule.maximumQuantity} onChange={(event) => update({ maximumQuantity: Number(event.target.value) })} /></div><div className="space-y-1"><Label className="text-xs">Minutes / tire</Label><Input type="number" min="1" value={rule.durationMinutesPerTire} onChange={(event) => update({ durationMinutesPerTire: Number(event.target.value) })} /></div><div className="rounded-lg bg-muted/30 p-3 text-xs"><p className="font-medium">Service charge preview</p><p className="mt-1">4 tires: ${(rule.baseInstallationPrice * 4 + rule.mountBalancePrice * 4).toFixed(2)}</p></div></div><div className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl border p-4 text-sm"><label className="flex items-center gap-2"><Checkbox checked={rule.requiresFitmentLookup} onCheckedChange={(value) => update({ requiresFitmentLookup: value === true })} />Require fitment lookup</label><label className="flex items-center gap-2"><Checkbox checked={rule.requiresInventorySelection} onCheckedChange={(value) => update({ requiresInventorySelection: value === true })} />Require inventory</label><label className="flex items-center gap-2"><Checkbox checked={rule.allowsManualFitment} onCheckedChange={(value) => update({ allowsManualFitment: value === true })} />Allow manual fitment</label><label className="flex items-center gap-2"><Checkbox checked={rule.allowsStaggeredFitment} onCheckedChange={(value) => update({ allowsStaggeredFitment: value === true })} />Allow staggered sizes</label></div><div className="flex justify-end"><Button disabled={saving} onClick={save}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save tire pricing"}</Button></div></>}</>}</CardContent></Card>;
}
