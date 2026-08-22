/**
 * TechInventory — Van stock management for technicians
 * 
 * Shows van inventory, low stock alerts, and usage tracking
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Package, AlertTriangle, Search, Minus, Plus, RefreshCw,
  Check, Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchTechInventoryDataForCurrentUser } from "@/application/queries/tech-app.query";
import { recordVanInventoryMovement, requestVanRestock } from "@/application/commands/tech-app.command";
import { queueInventoryMovement } from "@/offline/outbox";
import { toast } from "sonner";

interface VanInventoryItem {
  id: string;
  quantity: number;
  min_quantity: number;
  inventory_items: {
    id: string;
    name: string;
    sku: string | null;
    category: string | null;
    unit_cost: number;
  };
}

type FilterType = "all" | "low" | "oil" | "filters" | "supplies";

export default function TechInventory() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<VanInventoryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [vanId, setVanId] = useState<string | null>(null);
  const [vanName, setVanName] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [requestingRestock, setRequestingRestock] = useState(false);

  const fetchData = useCallback(async () => {
    const { vanId: assignedVanId, vanName: assignedVanName, items: inventoryItems } = await fetchTechInventoryDataForCurrentUser();

    if (!assignedVanId) {
      setVanId(null);
      setVanName("");
      setItems([]);
      setLoading(false);
      return;
    }

    setVanId(assignedVanId);
    setVanName(assignedVanName);
    setItems((inventoryItems || []) as unknown as VanInventoryItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success("Inventory refreshed");
  };

  const updateQuantity = async (item: VanInventoryItem, delta: number) => {
    const entryType = delta < 0 ? "consume" : "restock";
    const idempotencyKey = crypto.randomUUID();

    const { quantity, error } = await recordVanInventoryMovement({
      vanInventoryId: item.id,
      entryType,
      quantity: Math.abs(delta),
      idempotencyKey,
    });

    if (error) {
      // Queue the movement so field counts survive a dead zone, then reflect it locally.
      const queued = await queueInventoryMovement({
        vanInventoryId: item.id,
        entryType,
        quantity: Math.abs(delta),
        idempotencyKey,
      });
      if (queued) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)),
        );
        toast.success("Saved offline — syncing when you reconnect");
        return;
      }
      toast.error(error);
      return;
    }

    const newQty = quantity ?? Math.max(0, item.quantity + delta);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: newQty } : i)));
    toast.success(`${item.inventory_items.name}: ${newQty}`);
  };

  const submitRestockRequest = async () => {
    if (!vanId) return;
    const lowItems = items.filter((i) => i.quantity <= i.min_quantity);
    if (lowItems.length === 0) {
      toast.info("Nothing is below its minimum right now");
      return;
    }

    setRequestingRestock(true);
    const { error } = await requestVanRestock({
      vanId,
      items: lowItems.map((i) => ({
        van_inventory_id: i.id,
        name: i.inventory_items.name,
        quantity: Math.max(1, i.min_quantity - i.quantity),
      })),
      note: `Requested from the van inventory screen (${lowItems.length} low item${lowItems.length === 1 ? "" : "s"})`,
    });
    setRequestingRestock(false);

    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Restock request sent to dispatch");
  };

  const filteredItems = items.filter((item) => {
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const matchName = item.inventory_items.name.toLowerCase().includes(searchLower);
      const matchSku = item.inventory_items.sku?.toLowerCase().includes(searchLower);
      if (!matchName && !matchSku) return false;
    }

    // Category filter
    const category = item.inventory_items.category?.toLowerCase() || "";
    switch (filter) {
      case "low":
        return item.quantity <= item.min_quantity;
      case "oil":
        return category.includes("oil") || item.inventory_items.name.toLowerCase().includes("oil");
      case "filters":
        return category.includes("filter") || item.inventory_items.name.toLowerCase().includes("filter");
      case "supplies":
        return category.includes("suppl") || category.includes("shop");
      default:
        return true;
    }
  });

  const lowStockCount = items.filter((i) => i.quantity <= i.min_quantity).length;

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!vanId) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/tech-app/more")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Inventory</h1>
        </div>
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Truck className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No van assigned</p>
            <p className="text-sm mt-1">Contact dispatch to get assigned to a van.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/tech-app/more")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Van Inventory</h1>
              <p className="text-sm text-muted-foreground">{vanName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lowStockCount > 0 && (
              <Badge variant="destructive" className="h-6">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {lowStockCount} Low
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn("h-5 w-5", refreshing && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <TabsList className="w-full grid grid-cols-5 h-auto">
            <TabsTrigger value="all" className="text-xs py-2">All</TabsTrigger>
            <TabsTrigger value="low" className="text-xs py-2">
              Low Stock
            </TabsTrigger>
            <TabsTrigger value="oil" className="text-xs py-2">Oil</TabsTrigger>
            <TabsTrigger value="filters" className="text-xs py-2">Filters</TabsTrigger>
            <TabsTrigger value="supplies" className="text-xs py-2">Supplies</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Inventory List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No items found</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isLow = item.quantity <= item.min_quantity;
            return (
              <Card
                key={item.id}
                className={cn(isLow && "border-destructive/50 bg-destructive/5")}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {item.inventory_items.name}
                        </span>
                        {isLow && (
                          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {item.inventory_items.sku && (
                          <span className="font-mono">{item.inventory_items.sku}</span>
                        )}
                        {item.inventory_items.category && (
                          <>
                            <span>•</span>
                            <span>{item.inventory_items.category}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item, -1)}
                        disabled={item.quantity <= 0}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <div
                        className={cn(
                          "w-10 text-center font-bold",
                          isLow && "text-destructive"
                        )}
                      >
                        {item.quantity}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateQuantity(item, 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Request Restock Button */}
      <div className="sticky bottom-16 p-4 bg-background border-t">
        <Button
          variant="outline"
          className="w-full"
          onClick={submitRestockRequest}
          disabled={requestingRestock || lowStockCount === 0}
        >
          <Package className="h-4 w-4 mr-2" />
          {requestingRestock
            ? "Sending request..."
            : lowStockCount > 0
              ? `Request Restock (${lowStockCount} low)`
              : "Stock levels look good"}
        </Button>
      </div>
    </div>
  );
}
