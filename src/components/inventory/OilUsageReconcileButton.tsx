import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchInventoryOverview, type InventoryItem } from "@/application/queries";
import { reconcileServiceOilUsage } from "@/application/commands";
import { toast } from "@/components/ui/sonner";

export function OilUsageReconcileButton({
  serviceRecordId,
  oilType,
  quarts,
  onReconciled,
}: {
  serviceRecordId: string;
  oilType: string;
  quarts: number;
  onReconciled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchInventoryOverview()
      .then(({ items }) => setItems(items.filter((item) => (item.category ?? "").toLowerCase().includes("oil"))))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Failed to load inventory"));
  }, [open]);

  const exactMatch = useMemo(
    () => items.find((item) => item.name.trim().toLowerCase() === oilType.trim().toLowerCase()),
    [items, oilType],
  );

  useEffect(() => {
    if (exactMatch && !selected) setSelected(exactMatch.id);
  }, [exactMatch, selected]);

  async function reconcile() {
    if (!selected) return;
    setLoading(true);
    try {
      await reconcileServiceOilUsage({ serviceRecordId, inventoryItemId: selected });
      toast.success(`${quarts.toFixed(2)} qt reconciled to inventory`);
      setOpen(false);
      onReconciled();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Oil reconciliation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Reconcile</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconcile completed oil usage</DialogTitle>
            <DialogDescription>
              Deduct exactly {quarts.toFixed(2)} qt from a selected inventory item. The completed service remains the source of truth.
            </DialogDescription>
          </DialogHeader>
          {items.length ? (
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue placeholder="Select inventory oil" /></SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id} disabled={item.quantity < quarts}>
                    {item.name} — {item.quantity.toFixed(2)} {item.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">No active oil inventory items are configured. Oil usage history remains available without inventory.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!selected || loading} onClick={reconcile}>{loading ? "Reconciling…" : "Reconcile usage"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
