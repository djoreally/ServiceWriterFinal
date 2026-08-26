/**
 * WorkOrderPartsPanel — dispatch-side parts sourcing for a fleet work order.
 * Pulls the vehicle's registered part numbers, lets dispatch pick the stock item
 * and van to source from, then writes lines + reservations transactionally.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Package, Plus, Trash2, Save, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  fetchStockOptions,
  fetchVanStock,
  fetchVehiclePartSuggestions,
  fetchWorkOrderPartLines,
  fetchWorkOrderPartReservations,
  partCategoryLabel,
  type PartReservationRow,
  type PartSuggestion,
  type StockOption,
  type VanStockRow,
} from "@/application/queries/vehicle-parts-registry.query";
import {
  applyWorkOrderParts,
  consumeWorkOrderParts,
  type WorkOrderPartLineInput,
} from "@/application/commands/vehicle-parts-registry.command";

const NONE = "__none__";

interface DraftLine {
  key: string;
  description: string;
  part_number: string;
  quantity: number;
  unit_price: number;
  inventory_item_id: string;
  van_id: string;
}

interface WorkOrderPartsPanelProps {
  workOrderId: string;
  fleetVehicleId: string | null;
  editable: boolean;
  onChanged?: () => void;
}

export function WorkOrderPartsPanel({
  workOrderId,
  fleetVehicleId,
  editable,
  onChanged,
}: WorkOrderPartsPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [stock, setStock] = useState<StockOption[]>([]);
  const [vanStock, setVanStock] = useState<VanStockRow[]>([]);
  const [reservations, setReservations] = useState<PartReservationRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [existing, stockRows, vanRows, resRows] = await Promise.all([
        fetchWorkOrderPartLines(workOrderId),
        fetchStockOptions().catch((): StockOption[] => []),
        fetchVanStock().catch((): VanStockRow[] => []),
        fetchWorkOrderPartReservations(workOrderId).catch((): PartReservationRow[] => []),
      ]);

      setStock(stockRows);
      setVanStock(vanRows);
      setReservations(resRows);

      if (existing.length > 0) {
        setLines(
          existing.map((l, i) => ({
            key: `${l.id}-${i}`,
            description: l.description,
            part_number: l.part_number ?? "",
            quantity: Number(l.quantity ?? 1),
            unit_price: Number(l.unit_price ?? 0),
            inventory_item_id: l.inventory_item_id ?? "",
            van_id: l.van_id ?? "",
          })),
        );
      } else if (fleetVehicleId) {
        const suggestions = await fetchVehiclePartSuggestions("fleet", fleetVehicleId).catch(
          (): PartSuggestion[] => [],
        );
        setLines(
          suggestions.map((s, i) => {
            const item = s.inventory_item_id
              ? stockRows.find((r) => r.id === s.inventory_item_id)
              : undefined;
            return {
              key: `sug-${i}`,
              description: `${partCategoryLabel(s.part_category)} — ${s.part_number}`,
              part_number: s.part_number,
              quantity: Number(s.quantity ?? 1),
              unit_price: item ? Number(item.sell_price ?? 0) : 0,
              inventory_item_id: s.inventory_item_id ?? "",
              van_id: "",
            };
          }),
        );
      } else {
        setLines([]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load parts");
    } finally {
      setLoading(false);
    }
  }, [workOrderId, fleetVehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const vans = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of vanStock) map.set(v.van_id, v.van_name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [vanStock]);

  const availabilityFor = (line: DraftLine): { ok: boolean; label: string } => {
    if (!line.inventory_item_id) return { ok: true, label: "not tracked" };
    if (line.van_id) {
      const row = vanStock.find(
        (v) => v.van_id === line.van_id && v.inventory_item_id === line.inventory_item_id,
      );
      const qty = row?.quantity ?? 0;
      return { ok: qty >= line.quantity, label: `${qty} on van` };
    }
    const item = stockById.get(line.inventory_item_id);
    const qty = item?.quantity ?? 0;
    return { ok: qty >= line.quantity, label: `${qty} in warehouse` };
  };

  const update = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        description: "Part",
        part_number: "",
        quantity: 1,
        unit_price: 0,
        inventory_item_id: "",
        van_id: "",
      },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: WorkOrderPartLineInput[] = lines.map((l) => ({
        description: l.description || l.part_number || "Part",
        part_number: l.part_number || null,
        quantity: l.quantity,
        unit_price: l.unit_price,
        inventory_item_id: l.inventory_item_id || null,
        van_id: l.van_id || null,
        fleet_vehicle_id: fleetVehicleId,
      }));
      const result = await applyWorkOrderParts(workOrderId, payload);
      toast.success(`${result.lines} part line(s) saved, ${result.reservations} reserved`);
      onChanged?.();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save parts");
    } finally {
      setSaving(false);
    }
  };

  const consume = async () => {
    setSaving(true);
    try {
      const result = await consumeWorkOrderParts(workOrderId);
      toast.success(`${result.consumed} part(s) marked used, stock updated`);
      onChanged?.();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to consume parts");
    } finally {
      setSaving(false);
    }
  };

  const reservedCount = reservations.filter((r) => r.status === "reserved").length;
  const consumedCount = reservations.filter((r) => r.status === "consumed").length;

  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Parts &amp; Supplies
          </span>
          <Badge variant="outline" className="text-[10px]">{lines.length}</Badge>
          {reservedCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">{reservedCount} reserved</Badge>
          )}
          {consumedCount > 0 && (
            <Badge className="text-[10px]">{consumedCount} used</Badge>
          )}
        </div>
        {editable && (
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={addLine}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
            <Button size="sm" className="h-7 text-[10px]" disabled={saving} onClick={save}>
              <Save className="h-3 w-3 mr-1" /> Save &amp; reserve
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : lines.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">
          No parts on this work order. Add part numbers to the vehicle profile to auto-populate.
        </p>
      ) : (
        <div className="space-y-2">
          {lines.map((l) => {
            const avail = availabilityFor(l);
            return (
              <div key={l.key} className="rounded-md border border-border/60 p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    className="h-7 text-xs font-mono"
                    value={l.part_number}
                    placeholder="Part number"
                    disabled={!editable}
                    onChange={(e) => update(l.key, { part_number: e.target.value })}
                  />
                  <Input
                    className="h-7 text-xs w-16"
                    type="number"
                    min="0"
                    step="0.25"
                    value={l.quantity}
                    disabled={!editable}
                    onChange={(e) => update(l.key, { quantity: Number(e.target.value) || 0 })}
                  />
                  <Input
                    className="h-7 text-xs w-20"
                    type="number"
                    min="0"
                    step="0.01"
                    value={l.unit_price}
                    disabled={!editable}
                    onChange={(e) => update(l.key, { unit_price: Number(e.target.value) || 0 })}
                  />
                  {editable && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      aria-label="Remove part line"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={l.inventory_item_id || NONE}
                    disabled={!editable}
                    onValueChange={(v) => {
                      const id = v === NONE ? "" : v;
                      const item = id ? stockById.get(id) : undefined;
                      update(l.key, {
                        inventory_item_id: id,
                        unit_price: item ? Number(item.sell_price ?? 0) : l.unit_price,
                        description: item ? item.name : l.description,
                      });
                    }}
                  >
                    <SelectTrigger className="h-7 text-[11px] w-[190px]">
                      <SelectValue placeholder="Stock item" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No stock link</SelectItem>
                      {stock.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={l.van_id || NONE}
                    disabled={!editable}
                    onValueChange={(v) => update(l.key, { van_id: v === NONE ? "" : v })}
                  >
                    <SelectTrigger className="h-7 text-[11px] w-[150px]">
                      <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Warehouse</SelectItem>
                      {vans.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge
                    variant={avail.ok ? "secondary" : "destructive"}
                    className="text-[10px] gap-1"
                  >
                    {avail.ok ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-3 w-3" />
                    )}
                    {avail.label}
                  </Badge>
                </div>
              </div>
            );
          })}

          {reservedCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] w-full"
              disabled={saving}
              onClick={consume}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" /> Mark parts used (deduct stock)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
