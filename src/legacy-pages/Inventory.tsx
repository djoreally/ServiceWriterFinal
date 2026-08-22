import { useEffect, useState, useCallback, useMemo } from "react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshContainer } from "@/components/ui/pull-to-refresh";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Package, AlertTriangle, Edit, Trash2, Truck, ArrowRightLeft, Sparkles, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OilUsageTab } from "@/components/inventory/OilUsageTab";
import { OIL_SEED_ITEMS, OIL_SEED_DEFAULT_QUANTITY } from "@/lib/inventorySeeds";
import { toast } from "sonner";
import { StatCard } from "@/components/dashboard/StatCard";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { inventorySchema, getFirstError } from "@/lib/validation";
import { useDebounce } from "@/hooks/useDebounce";
import { fetchInventoryOverview } from "@/application/queries";
import { createInventoryItem, updateInventoryItem, deleteInventoryItem, transferInventoryToVan, uploadInventoryImage } from "@/application/commands";
import { bankersRound } from "@/lib/financialMath";
import { DataTableEnhancementToolbar } from "@/components/data-table/DataTableEnhancementToolbar";
import { TableSkeleton } from "@/components/loading/PageSkeletons";

import type { InventoryItem, Van, VanInventoryLink } from "@/application/queries";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";

const Inventory = () => {
  const { formatCurrency, getCurrencySymbol } = useRegionalSettings();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [vans, setVans] = useState<Van[]>([]);
  const [vanInventory, setVanInventory] = useState<VanInventoryLink[]>([]);
  const [reservations, setReservations] = useState<Array<{ inventory_item_id: string; quantity: number; source: string; van_id: string | null }>>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState({
    name: "", description: "", sku: "", quantity: "", unit: "qt", unit_cost: "", sell_price: "", category: "", low_stock_threshold: "5", image_url: "", reorder_url: "", tire_size: "", tire_load_index: "", tire_speed_rating: "", tire_season: "", tire_position: "all",
  });

  // Transfer dialog state
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferItemId, setTransferItemId] = useState<string | null>(null);
  const [transferVanId, setTransferVanId] = useState("");
  const [transferQty, setTransferQty] = useState("1");
  const [seeding, setSeeding] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [tableDensity, setTableDensity] = useState<"compact" | "normal" | "comfortable">("normal");
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { items, vans, vanInventory, reservations } = await fetchInventoryOverview();
      setItems(items);
      setVans(vans);
      setVanInventory(vanInventory);
      setReservations(reservations);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch inventory";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const { containerRef, isRefreshing } = usePullToRefresh({ onRefresh: fetchAll });

  const handleSeedOils = async () => {
    if (seeding) return;
    const existingNames = new Set(items.map((i) => i.name.trim().toLowerCase()));
    const toCreate = OIL_SEED_ITEMS.filter(
      (s) => !existingNames.has(s.name.trim().toLowerCase()),
    );
    if (toCreate.length === 0) {
      toast.info("All seed oils already exist");
      return;
    }
    if (!confirm(`Add ${toCreate.length} oil item(s) at ${OIL_SEED_DEFAULT_QUANTITY}qt each?`)) return;
    setSeeding(true);
    let ok = 0;
    let failed = 0;
    for (const seed of toCreate) {
      try {
        await createInventoryItem({
          name: seed.name,
          description: seed.description,
          sku: seed.sku,
          category: seed.category,
          quantity: OIL_SEED_DEFAULT_QUANTITY,
          unit: "qt",
          unit_cost: 0,
          sell_price: 0,
          low_stock_threshold: 5,
        });
        ok++;
      } catch {
        failed++;
      }
    }
    setSeeding(false);
    if (ok > 0) toast.success(`Seeded ${ok} oil item(s)`);
    if (failed > 0) toast.error(`${failed} item(s) failed to seed`);
    fetchAll();
  };

  // Get van stock breakdown for a given item
  const getVanStockForItem = useCallback((itemId: string): VanInventoryLink[] => {
    return vanInventory.filter(vi => vi.inventory_item_id === itemId);
  }, [vanInventory]);

  // Transfer stock from warehouse to van using restock_van RPC
  const handleTransfer = async () => {
    if (!transferItemId || !transferVanId) return;
    const qty = parseInt(transferQty);
    if (qty <= 0) { toast.error("Quantity must be greater than 0"); return; }

    const item = items.find(i => i.id === transferItemId);
    if (item && qty > item.quantity) {
      toast.error(`Only ${item.quantity} in warehouse`);
      return;
    }

    try {
      await transferInventoryToVan({
        itemId: transferItemId,
        vanId: transferVanId,
        quantity: qty,
      });
      toast.success(`Transferred ${qty} units to van`);
      setTransferOpen(false);
      setTransferItemId(null);
      setTransferVanId("");
      setTransferQty("1");
      fetchAll();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to transfer inventory";
      toast.error(message);
    }
  };

  const openTransferDialog = (itemId: string) => {
    setTransferItemId(itemId);
    setTransferVanId(vans.length === 1 ? vans[0].id : "");
    setTransferQty("1");
    setTransferOpen(true);
  };

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const imageUrl = await uploadInventoryImage(file);
      setFormData((prev) => ({ ...prev, image_url: imageUrl }));
      toast.success("Image uploaded");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to upload image";
      toast.error(message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationResult = inventorySchema.safeParse({
      name: formData.name, description: formData.description, sku: formData.sku,
      category: formData.category, quantity: parseInt(formData.quantity) || 0,
      unit_cost: bankersRound(Number(formData.unit_cost) || 0, 2), sell_price: bankersRound(Number(formData.sell_price) || 0, 2),
      low_stock_threshold: parseInt(formData.low_stock_threshold) || 5,
      image_url: formData.image_url,
      reorder_url: formData.reorder_url,
    });
    if (!validationResult.success) { toast.error(getFirstError(validationResult) || "Validation error"); return; }

    const itemData = {
      name: validationResult.data.name, description: validationResult.data.description || null,
      sku: validationResult.data.sku || null, quantity: validationResult.data.quantity,
      unit: formData.unit || "qt",
      unit_cost: validationResult.data.unit_cost, sell_price: validationResult.data.sell_price,
      category: validationResult.data.category || null, low_stock_threshold: validationResult.data.low_stock_threshold,
      image_url: validationResult.data.image_url || null,
      reorder_url: validationResult.data.reorder_url || null,
      tire_size: formData.tire_size.trim().toUpperCase() || null,
      tire_load_index: formData.tire_load_index.trim() || null,
      tire_speed_rating: formData.tire_speed_rating.trim().toUpperCase() || null,
      tire_season: formData.tire_season || null,
      tire_position: formData.tire_position === "all" ? null : formData.tire_position,
    };

    if (editingItem) {
      try {
        await updateInventoryItem(editingItem.id, itemData);
        toast.success("Updated");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update";
        toast.error(message);
        return;
      }
    } else {
      try {
        await createInventoryItem(itemData);
        toast.success("Created");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create";
        toast.error(message);
        return;
      }
    }

    setOpen(false);
    resetForm();
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    try {
      await deleteInventoryItem(id);
      toast.success("Deleted");
      fetchAll();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed";
      toast.error(message);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItemIds.length === 0) return;
    if (!confirm(`Delete ${selectedItemIds.length} selected inventory item(s)?`)) return;
    setBulkProcessing(true);
    let deleted = 0;
    try {
      for (const id of selectedItemIds) {
        await deleteInventoryItem(id);
        deleted += 1;
      }
      toast.success(`Deleted ${deleted} inventory item${deleted === 1 ? "" : "s"}`);
      setSelectedItemIds([]);
      fetchAll();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Bulk delete failed");
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkExport = () => {
    const selected = items.filter((item) => selectedItemIds.includes(item.id));
    if (selected.length === 0) return;
    const headers = ["Name", "SKU", "Category", "Quantity", "Unit", "Unit Cost", "Sell Price", "Low Stock Threshold"];
    const rows = selected.map((item) => [item.name, item.sku || "", item.category || "", item.quantity, getInventoryUnit(item), item.unit_cost, item.sell_price, item.low_stock_threshold]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-selection-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const resetForm = () => {
    setFormData({ name: "", description: "", sku: "", quantity: "", unit: "qt", unit_cost: "", sell_price: "", category: "", low_stock_threshold: "5", image_url: "", reorder_url: "", tire_size: "", tire_load_index: "", tire_speed_rating: "", tire_season: "", tire_position: "all" });
    setEditingItem(null);
  };

  const openEditDialog = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name, description: item.description || "", sku: item.sku || "",
      quantity: item.quantity.toString(),
      unit: getInventoryUnit(item),
      unit_cost: item.unit_cost.toString(),
      sell_price: item.sell_price.toString(), category: item.category || "",
      low_stock_threshold: item.low_stock_threshold.toString(),
      image_url: item.image_url || "",
      reorder_url: item.reorder_url || "",
      tire_size: item.tire_size || "", tire_load_index: item.tire_load_index || "", tire_speed_rating: item.tire_speed_rating || "", tire_season: item.tire_season || "", tire_position: item.tire_position || "all",
    });
    setOpen(true);
  };

  // ⚡ Performance: Debounce search input to avoid re-filtering on every keystroke
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // ⚡ Performance: Memoize filtered list to prevent expensive re-filtering on unrelated state changes
  const filteredItems = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase().trim();
    if (!q) return items;

    return items.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.sku?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) || item.tire_size?.toLowerCase().includes(q) || item.tire_load_index?.toLowerCase().includes(q) || item.tire_speed_rating?.toLowerCase().includes(q)
    );
  }, [items, debouncedSearchQuery]);

  const inventoryColumns = ["Item", "SKU", "Category", "Unit", "Warehouse", "Reserved", "Van Stock", "Cost", "Price"];
  const isColumnVisible = (column: string) => !hiddenColumns.includes(column);
  const rowClassName = tableDensity === "compact" ? "h-10" : tableDensity === "comfortable" ? "h-16" : undefined;
  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedItemIds.includes(item.id));
  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  };
  const toggleAllFilteredItems = () => {
    setSelectedItemIds((current) => {
      const filteredIds = filteredItems.map((item) => item.id);
      if (filteredIds.every((id) => current.includes(id))) return current.filter((id) => !filteredIds.includes(id));
      return Array.from(new Set([...current, ...filteredIds]));
    });
  };

  // ⚡ Performance: Memoize derived statistics
  const lowStockItems = useMemo(() => items.filter(item => item.quantity <= item.low_stock_threshold), [items]);
  const totalValue = useMemo(() => items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0), [items]);

  const vanNameMap = useMemo(() => new Map(vans.map(v => [v.id, v.name])), [vans]);
  const getInventoryUnit = (item: InventoryItem) => ("unit" in item && typeof item.unit === "string" ? item.unit : "qt");

  return (
    <AppLayout title="Inventory">
      <PullToRefreshContainer containerRef={containerRef} isRefreshing={isRefreshing}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Parts & Inventory</h2>
            <p className="text-sm sm:text-base text-muted-foreground">Manage your parts and supplies</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              className="gap-2 w-full sm:w-auto"
              onClick={handleSeedOils}
              disabled={seeding}
            >
              <Sparkles className="h-4 w-4" />
              {seeding ? "Seeding..." : "Seed Oils"}
            </Button>
            <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
            <DialogTrigger asChild><Button className="gap-2 w-full sm:w-auto"><Plus className="h-4 w-4" />Add Item</Button></DialogTrigger>
            <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingItem ? "Edit Item" : "Add New Item"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2"><Label>Name *</Label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>SKU</Label><Input value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Category</Label><Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-sm font-medium">Tire fitment <span className="font-normal text-muted-foreground">(tire inventory only)</span></p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="col-span-2 sm:col-span-1"><Label>Size</Label><Input className="font-mono" placeholder="225/65R17" value={formData.tire_size} onChange={(e) => setFormData({ ...formData, tire_size: e.target.value })} /></div>
                    <div><Label>Load</Label><Input placeholder="102" value={formData.tire_load_index} onChange={(e) => setFormData({ ...formData, tire_load_index: e.target.value })} /></div>
                    <div><Label>Speed</Label><Input placeholder="H" value={formData.tire_speed_rating} onChange={(e) => setFormData({ ...formData, tire_speed_rating: e.target.value })} /></div>
                    <div><Label>Season</Label><Select value={formData.tire_season || "none"} onValueChange={(v) => setFormData({ ...formData, tire_season: v === "none" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not set</SelectItem><SelectItem value="all-season">All season</SelectItem><SelectItem value="summer">Summer</SelectItem><SelectItem value="winter">Winter</SelectItem></SelectContent></Select></div>
                    <div><Label>Position</Label><Select value={formData.tire_position} onValueChange={(v) => setFormData({ ...formData, tire_position: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any</SelectItem><SelectItem value="front">Front</SelectItem><SelectItem value="rear">Rear</SelectItem></SelectContent></Select></div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Item Image</Label>
                    <Input type="file" accept="image/*" onChange={(e) => void handleImageUpload(e.target.files?.[0] || null)} disabled={uploadingImage} />
                    {formData.image_url && <ProgressiveImage src={formData.image_url} alt="Item preview" className="h-14 w-14 rounded-md object-cover border border-border/50" placeholderClassName="h-14 w-14 rounded-md" />}
                  </div>
                  <div className="space-y-2"><Label>Reorder Link</Label><Input type="url" placeholder="https://..." value={formData.reorder_url} onChange={(e) => setFormData({ ...formData, reorder_url: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                  <div className="space-y-2"><Label>Quantity *</Label><Input type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} required /></div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="qt">Quart (qt)</SelectItem>
                        <SelectItem value="gal">Gallon (gal)</SelectItem>
                        <SelectItem value="l">Liter (L)</SelectItem>
                        <SelectItem value="each">Each</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Low Stock Alert</Label><Input type="number" min="0" value={formData.low_stock_threshold} onChange={(e) => setFormData({ ...formData, low_stock_threshold: e.target.value })} placeholder="5" /></div>
                  <div className="space-y-2"><Label>Unit Cost ({getCurrencySymbol()})</Label><Input type="number" step="0.01" value={formData.unit_cost} onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Sell Price ({getCurrencySymbol()})</Label><Input type="number" step="0.01" value={formData.sell_price} onChange={(e) => setFormData({ ...formData, sell_price: e.target.value })} /></div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit">{editingItem ? "Update" : "Create"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Tabs defaultValue="items" className="space-y-4">
          <TabsList>
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="usage">Oil Usage</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-4">
            {loading ? (
              <TableSkeleton rows={6} columns={7} />
            ) : (
            <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard title="Total Items" value={items.length} icon={Package} trend="+5 this month" iconBgColor="bg-primary/10" iconColor="text-primary" />
              <StatCard title="Low Stock Items" value={lowStockItems.length} icon={AlertTriangle} subtitle={lowStockItems.length > 0 ? "Needs attention" : "All stocked"} iconBgColor="bg-yellow-500/10" iconColor="text-yellow-600" />
              <StatCard title="Total Value" value={formatCurrency(totalValue)} icon={Package} subtitle="At cost" iconBgColor="bg-gray-500/10" iconColor="text-gray-600" />
            </div>

            {/* Search */}
            <Card className="border border-border/50">
              <CardContent className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by name, SKU, or category..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                </div>
              </CardContent>
            </Card>

            <DataTableEnhancementToolbar
              columns={inventoryColumns}
              density={tableDensity}
              hiddenColumns={hiddenColumns}
              selectedCount={selectedItemIds.length}
              onBulkAction={handleBulkDelete}
              onDensityChange={setTableDensity}
              onToggleColumn={(column) => setHiddenColumns((current) => current.includes(column) ? current.filter((item) => item !== column) : [...current, column])}
            />
            {selectedItemIds.length > 0 && (
              <div className="flex flex-wrap gap-2 rounded-md border bg-muted/40 p-3">
                <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkProcessing}>Delete selected</Button>
                <Button size="sm" variant="outline" onClick={handleBulkExport} disabled={bulkProcessing}>Export selected</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedItemIds([])} disabled={bulkProcessing}>Clear selection</Button>
              </div>
            )}

            {/* Table */}
            <Card className="border border-border/50">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                <Table density="compact">
                  <TableHeader>
                    <TableRow className="border-border/50">
                      <TableHead className="w-10"><Checkbox checked={allFilteredSelected} onCheckedChange={toggleAllFilteredItems} aria-label="Select all filtered inventory items" /></TableHead>
                      {isColumnVisible("Item") && <TableHead className="font-medium">ITEM</TableHead>}
                      {isColumnVisible("SKU") && <TableHead className="font-medium">SKU</TableHead>}
                      {isColumnVisible("Category") && <TableHead className="font-medium">CATEGORY</TableHead>}
                      {isColumnVisible("Unit") && <TableHead className="font-medium text-center">UNIT</TableHead>}
                      {isColumnVisible("Warehouse") && <TableHead className="font-medium text-center">WAREHOUSE</TableHead>}
                      {isColumnVisible("Reserved") && <TableHead className="font-medium text-center">RESERVED</TableHead>}
                      {isColumnVisible("Van Stock") && <TableHead className="font-medium text-center">VAN STOCK</TableHead>}
                      {isColumnVisible("Cost") && <TableHead className="font-medium text-right">COST</TableHead>}
                      {isColumnVisible("Price") && <TableHead className="font-medium text-right">PRICE</TableHead>}
                      <TableHead className="font-medium w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow><TableCell colSpan={11} className="text-center py-12 text-muted-foreground">No items found</TableCell></TableRow>
                    ) : (
                      filteredItems.map((item) => {
                        const vanStock = getVanStockForItem(item.id);
                        const totalVanQty = vanStock.reduce((s, v) => s + v.quantity, 0);
                        const itemReserved = reservations
                          .filter((r) => r.inventory_item_id === item.id)
                          .reduce((s, r) => s + (r.quantity || 0), 0);
                        const warehouseAvailable = item.quantity - itemReserved;
                        return (
                          <TableRow key={item.id} className={rowClassName}>
                            <TableCell><Checkbox checked={selectedItemIds.includes(item.id)} onCheckedChange={() => toggleItemSelection(item.id)} aria-label={`Select inventory item ${item.name}`} /></TableCell>
                            {isColumnVisible("Item") && <TableCell>
                              <div className="flex items-center gap-3">
                                {item.image_url ? (
                                  <ProgressiveImage src={item.image_url} alt={item.name} className="h-10 w-10 rounded-lg object-cover border border-border/40" placeholderClassName="h-10 w-10 rounded-lg" />
                                ) : (
                                  <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                    <Package className="h-5 w-5 text-primary" />
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium">{item.name}</p>
                                  {item.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>}
                                  {item.reorder_url && (
                                    <a href={item.reorder_url} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 text-primary hover:underline">
                                      Reorder
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </TableCell>}
                            {isColumnVisible("SKU") && <TableCell className="font-mono text-sm">{item.sku || "—"}</TableCell>}
                            {isColumnVisible("Category") && <TableCell>{item.category ? <Badge variant="secondary">{item.category}</Badge> : "—"}</TableCell>}
                            {isColumnVisible("Unit") && <TableCell className="text-center text-xs uppercase text-muted-foreground">{getInventoryUnit(item)}</TableCell>}
                            {/* Warehouse qty */}
                            {isColumnVisible("Warehouse") && <TableCell className="text-center">
                              <span className={warehouseAvailable <= item.low_stock_threshold ? "text-yellow-600 font-medium" : ""}>{item.quantity}</span>
                              {warehouseAvailable <= item.low_stock_threshold && <span className="text-xs text-muted-foreground ml-1">(low)</span>}
                            </TableCell>}
                            {isColumnVisible("Reserved") && <TableCell className="text-center">
                              {itemReserved > 0 ? (
                                <Badge variant="outline" className="text-xs">
                                  {itemReserved} held
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>}
                            {/* Van stock breakdown */}
                            {isColumnVisible("Van Stock") && <TableCell className="text-center">
                              {vanStock.length > 0 ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  {vanStock.map(vs => (
                                    <span key={vs.van_id} className="text-xs">
                                      <Truck className="inline h-3 w-3 mr-0.5 text-muted-foreground" />
                                      {vanNameMap.get(vs.van_id) || "Van"}: <span className="font-medium">{vs.quantity}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>}
                            {isColumnVisible("Cost") && <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>}
                            {isColumnVisible("Price") && <TableCell className="text-right font-medium">{formatCurrency(item.sell_price)}</TableCell>}
                            <TableCell>
                              <div className="flex gap-1">
                                {vans.length > 0 && (
                                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Transfer to van" onClick={() => openTransferDialog(item.id)}>
                                    <ArrowRightLeft className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(item)}><Edit className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
            </>
            )}
          </TabsContent>

          <TabsContent value="usage">
            <OilUsageTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Transfer to Van Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
              Transfer to Van
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {transferItemId && (
              <p className="text-sm text-muted-foreground">
                Transferring <span className="font-medium text-foreground">{items.find(i => i.id === transferItemId)?.name}</span>
                {" "}— Warehouse stock: <span className="font-medium text-foreground">{items.find(i => i.id === transferItemId)?.quantity}</span>
              </p>
            )}
            <div className="space-y-2">
              <Label>Select Van</Label>
              <Select value={transferVanId} onValueChange={setTransferVanId}>
                <SelectTrigger><SelectValue placeholder="Choose a van..." /></SelectTrigger>
                <SelectContent>
                  {vans.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity to Transfer</Label>
              <Input
                type="number"
                min="1"
                max={items.find(i => i.id === transferItemId)?.quantity || 999}
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">This deducts from warehouse and adds to the van's mobile stock</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
              <Button onClick={handleTransfer} disabled={!transferVanId || !transferQty}>Transfer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </PullToRefreshContainer>
    </AppLayout>
  );
};

export default Inventory;
