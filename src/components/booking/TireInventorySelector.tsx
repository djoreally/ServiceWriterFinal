import { useEffect, useState } from "react";
import { Loader2, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  fetchPublicTireInventory,
  type PublicTireInventoryItem,
} from "@/application/queries/public-tire-inventory.query";

interface TireInventorySelectorProps {
  businessUserId: string;
  tireSize: string;
  requestedQuantity: number;
  selectedId?: string;
  onSelect: (item: PublicTireInventoryItem) => void;
  onClearSelection: () => void;
}

export function TireInventorySelector({
  businessUserId,
  tireSize,
  requestedQuantity,
  selectedId,
  onSelect,
  onClearSelection,
}: TireInventorySelectorProps) {
  const [items, setItems] = useState<PublicTireInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => setLoading(true));
    void Promise.resolve().then(() => fetchPublicTireInventory(businessUserId, tireSize)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      }));
    return () => {
      active = false;
    };
  }, [businessUserId, tireSize]);

  useEffect(() => {
    if (!selectedId || loading) return;
    const selectedItem = items.find((item) => item.id === selectedId);
    if (
      !selectedItem ||
      requestedQuantity < 1 ||
      selectedItem.available_quantity < requestedQuantity
    ) {
      onClearSelection();
    }
  }, [items, loading, onClearSelection, requestedQuantity, selectedId]);

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <Label>Available tires for {tireSize}</Label>
      {requestedQuantity < 1 && (
        <p className="text-sm text-amber-700">
          Select how many tires you need before choosing inventory.
        </p>
      )}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking stock…
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No matching tire inventory is available online. The provider can still confirm options.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const insufficientStock =
              requestedQuantity > 0 && item.available_quantity < requestedQuantity;
            return (
              <Button
                key={item.id}
                type="button"
                variant={selectedId === item.id ? "default" : "outline"}
                className="h-auto w-full justify-between gap-3 py-3 text-left"
                disabled={requestedQuantity < 1 || insufficientStock}
                onClick={() => onSelect(item)}
              >
                <span>
                  <span className="block font-semibold">{item.name}</span>
                  <span className="block text-xs opacity-80">
                    {item.sku || "No SKU"} · {item.tire_load_index || "—"}
                    {item.tire_speed_rating || ""} · {item.tire_season || "Season not listed"}
                  </span>
                  {insufficientStock && (
                    <span className="block text-xs text-destructive">
                      Only {item.available_quantity} available; you requested {requestedQuantity}.
                    </span>
                  )}
                </span>
                <span className="text-right">
                  <span className="block font-semibold">
                    ${Number(item.sell_price).toFixed(2)}
                  </span>
                  <Badge variant="secondary">
                    <PackageCheck className="mr-1 h-3 w-3" />
                    {item.available_quantity} in stock
                  </Badge>
                </span>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
