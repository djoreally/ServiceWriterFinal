/**
 * VehiclePartsManager — reusable per-vehicle parts registry editor.
 * Used by Fleet vehicle profiles and residential customer vehicles.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Package, Sparkles, Check } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  PART_CATEGORIES,
  fetchStockOptions,
  fetchVehiclePartAssignments,
  fetchVehiclePartSuggestions,
  partCategoryLabel,
  type PartSuggestion,
  type StockOption,
  type VehicleKind,
  type VehiclePartAssignment,
} from "@/application/queries/vehicle-parts-registry.query";
import {
  addVehiclePart,
  deleteVehiclePart,
  promotePartsToSpecReference,
} from "@/application/commands/vehicle-parts-registry.command";

interface VehiclePartsManagerProps {
  vehicleKind: VehicleKind;
  vehicleId: string;
  vehicleLabel?: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  engine?: string | null;
  className?: string;
}

const NONE = "__none__";

export function VehiclePartsManager({
  vehicleKind,
  vehicleId,
  vehicleLabel,
  year,
  make,
  model,
  engine,
  className,
}: VehiclePartsManagerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [parts, setParts] = useState<VehiclePartAssignment[]>([]);
  const [stock, setStock] = useState<StockOption[]>([]);
  const [suggestions, setSuggestions] = useState<
    Array<{ part_category: string; part_number: string }>
  >([]);

  const [category, setCategory] = useState("oil_filter");
  const [partNumber, setPartNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [stockItemId, setStockItemId] = useState<string>(NONE);
  const [required, setRequired] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assigned, stockRows, suggested] = await Promise.all([
        fetchVehiclePartAssignments(vehicleKind, vehicleId),
        fetchStockOptions().catch(() => [] as StockOption[]),
        fetchVehiclePartSuggestions(vehicleKind, vehicleId).catch((): PartSuggestion[] => []),
      ]);
      setParts(assigned);
      setStock(stockRows);
      setSuggestions(
        suggested
          .filter((s) => s.source === "spec_reference")
          .map((s) => ({ part_category: s.part_category, part_number: s.part_number })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load parts");
    } finally {
      setLoading(false);
    }
  }, [vehicleKind, vehicleId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);

  const resetForm = () => {
    setPartNumber("");
    setBrand("");
    setQuantity("1");
    setStockItemId(NONE);
    setRequired(true);
  };

  const handleAdd = async (override?: { part_category: string; part_number: string }) => {
    const cat = override?.part_category ?? category;
    const pn = (override?.part_number ?? partNumber).trim();
    if (!pn) {
      toast.error("Enter a part number");
      return;
    }
    setSaving(true);
    try {
      await addVehiclePart(vehicleKind, vehicleId, {
        part_category: cat,
        part_number: pn,
        brand: override ? null : brand,
        quantity: override ? 1 : Number(quantity) || 1,
        inventory_item_id: override || stockItemId === NONE ? null : stockItemId,
        is_required: override ? true : required,
      });
      await promotePartsToSpecReference({
        year: year ?? null,
        make: make ?? null,
        model: model ?? null,
        engine: engine ?? null,
        parts: [{ part_category: cat, part_number: pn }],
      }).catch((): void => undefined);
      toast.success("Part added");
      if (!override) resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add part");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteVehiclePart(id);
      setParts((prev) => prev.filter((p) => p.id !== id));
      toast.success("Part removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove part");
    }
  };

  const unusedSuggestions = suggestions.filter(
    (s) => !parts.some((p) => p.part_number.toLowerCase() === s.part_number.toLowerCase()),
  );

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" />
          Parts &amp; Supplies
          {vehicleLabel ? (
            <span className="text-muted-foreground text-sm font-normal">— {vehicleLabel}</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            {parts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No part numbers recorded for this vehicle yet. Parts added here are pulled into
                every work order and shown to the technician.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {parts.map((p) => {
                  const item = p.inventory_item_id ? stockById.get(p.inventory_item_id) : null;
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{p.part_number}</span>
                          <Badge variant="secondary">{partCategoryLabel(p.part_category)}</Badge>
                          {p.brand ? (
                            <span className="text-xs text-muted-foreground">{p.brand}</span>
                          ) : null}
                          {!p.is_required ? <Badge variant="outline">Optional</Badge> : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Qty {Number(p.quantity)}
                          {item ? ` · linked to stock: ${item.name} (${item.quantity} on hand)` : " · not linked to stock"}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${p.part_number}`}
                        onClick={() => handleDelete(p.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {unusedSuggestions.length > 0 && (
              <div className="rounded-md border border-dashed p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4" />
                  Suggested from shop reference data
                </div>
                <div className="flex flex-wrap gap-2">
                  {unusedSuggestions.map((s) => (
                    <Button
                      key={`${s.part_category}-${s.part_number}`}
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => handleAdd(s)}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      {partCategoryLabel(s.part_category)}: {s.part_number}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PART_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Part number</Label>
                <Input
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  placeholder="PH7317"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label>Brand</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Fram" />
              </div>
              <div className="space-y-1">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.25"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Link to stock item</Label>
                <Select value={stockItemId} onValueChange={setStockItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not linked</SelectItem>
                    {stock.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.quantity} on hand)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex items-center gap-2">
                  <Switch id="part-required" checked={required} onCheckedChange={setRequired} />
                  <Label htmlFor="part-required" className="text-sm">
                    Required
                  </Label>
                </div>
                <Button className="ml-auto" disabled={saving} onClick={() => handleAdd()}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add part
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
