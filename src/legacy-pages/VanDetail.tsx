import { errorMessage } from "@/lib/error-message";
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { VehicleYMMSelector } from "@/components/vehicles/VehicleYMMSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Truck, MapPin, Package, Calendar, Plus, Trash2, RefreshCw, Save, Search, Loader2, User, ExternalLink } from "lucide-react";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const TerritoryMap = lazy(() => import("@/components/fleet/TerritoryMap").then(m => ({ default: m.TerritoryMap })));
import { toast } from "@/components/ui/sonner";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { format } from "date-fns";

import { fetchVanDetail } from "@/application/queries/van-detail.query";
import type { VanDetailData, VanTerritory, VanInventoryItem, VanAppointment, VanTechnician, WarehouseItem } from "@/application/queries/van-detail.query";
import {
  updateVan,
  addVanTerritory,
  bulkAddVanTerritories,
  removeVanTerritory,
  toggleTerritoryPrimary,
  restockVan,
  addVanInventoryItem,
  decodeVin,
} from "@/application/commands/van-detail.command";

const VanDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { formatCurrency } = useRegionalSettings();

  const [van, setVan] = useState<VanDetailData | null>(null);
  const [territories, setTerritories] = useState<VanTerritory[]>([]);
  const [inventory, setInventory] = useState<VanInventoryItem[]>([]);
  const [appointments, setAppointments] = useState<VanAppointment[]>([]);
  const [technicians, setTechnicians] = useState<VanTechnician[]>([]);
  const [warehouseItems, setWarehouseItems] = useState<WarehouseItem[]>([]);

  const [newZip, setNewZip] = useState("");
  const [bulkZips, setBulkZips] = useState("");
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockItemId, setRestockItemId] = useState("");
  const [restockQty, setRestockQty] = useState("1");
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemId, setAddItemId] = useState("");
  const [addItemQty, setAddItemQty] = useState("1");
  const [addItemMin, setAddItemMin] = useState("1");
  const [vinDecoding, setVinDecoding] = useState(false);

  const [editForm, setEditForm] = useState({
    name: "",
    vin: "",
    license_plate: "",
    make: "",
    model: "",
    year: "",
    status: "active",
    assigned_technician_id: "",
  });

  const handleVinDecode = async () => {
    const vin = editForm.vin.trim();
    if (!vin || vin.length !== 17) {
      toast.error("Enter a valid 17-character VIN");
      return;
    }
    setVinDecoding(true);
    try {
      const data = await decodeVin(vin);
      if (data?.year || data?.make || data?.model) {
        setEditForm((prev) => ({
          ...prev,
          year: data.year?.toString() || prev.year,
          make: data.make || prev.make,
          model: data.model || prev.model,
        }));
        toast.success(`Decoded: ${data.year} ${data.make} ${data.model}`);
      } else {
        toast.error("VIN not recognized — enter Year/Make/Model manually");
      }
    } catch {
      toast.error("VIN decode failed — enter Year/Make/Model manually");
    } finally {
      setVinDecoding(false);
    }
  };

  const fetchAll = useCallback(async () => {
    if (!id) return;
    const result = await fetchVanDetail(id);
    if (!result.van) { navigate("/fleet"); return; }
    setVan(result.van);
    setEditForm({
      name: result.van.name,
      vin: result.van.vin || "",
      license_plate: result.van.license_plate || "",
      make: result.van.make || "",
      model: result.van.model || "",
      year: result.van.year?.toString() || "",
      status: result.van.status,
      assigned_technician_id: result.van.assigned_technician_id || "",
    });
    setTerritories(result.territories);
    setInventory(result.inventory);
    setAppointments(result.appointments);
    setTechnicians(result.technicians);
    setWarehouseItems(result.warehouseItems);
  }, [id, navigate]);

  useEffect(() => { void Promise.resolve().then(() => fetchAll()); }, [fetchAll]);

  const handleSaveVan = async () => {
    if (!id) return;
    try {
      await updateVan(id, {
        name: editForm.name,
        vin: editForm.vin || null,
        license_plate: editForm.license_plate || null,
        make: editForm.make || null,
        model: editForm.model || null,
        year: editForm.year ? parseInt(editForm.year) : null,
        status: editForm.status,
        assigned_technician_id: editForm.assigned_technician_id || null,
      });
      toast.success("Van updated");
      fetchAll();
    } catch { toast.error("Failed to update van"); }
  };

  const handleAddZip = async () => {
    if (!newZip.trim() || !id) return;
    try {
      await addVanTerritory(id, newZip.trim());
      toast.success(`Zip code ${newZip} added`);
      setNewZip("");
      fetchAll();
    } catch (e: unknown) { toast.error(errorMessage(e)); }
  };

  const handleBulkAddZips = async () => {
    if (!bulkZips.trim() || !id) return;
    const zips = bulkZips.split(/[,\n\s]+/).map(z => z.trim()).filter(Boolean);
    try {
      await bulkAddVanTerritories(id, zips);
      toast.success(`${zips.length} zip codes added`);
      setBulkZips("");
      fetchAll();
    } catch (e: unknown) { toast.error(errorMessage(e)); }
  };

  const handleRemoveZip = async (territoryId: string) => {
    try {
      await removeVanTerritory(territoryId);
      toast.success("Removed");
      fetchAll();
    } catch { toast.error("Failed to remove"); }
  };

  const handleTogglePrimary = async (territoryId: string, current: boolean) => {
    try {
      await toggleTerritoryPrimary(territoryId, current);
      fetchAll();
    } catch { toast.error("Failed to update"); }
  };

  const handleRestock = async () => {
    if (!restockItemId || !id) return;
    const qty = parseInt(restockQty);
    if (qty <= 0) { toast.error("Quantity must be positive"); return; }
    try {
      await restockVan(id, restockItemId, qty);
      toast.success("Restocked successfully");
      setRestockOpen(false);
      setRestockItemId("");
      setRestockQty("1");
      fetchAll();
    } catch (e: unknown) { toast.error(errorMessage(e)); }
  };

  const handleAddInventoryItem = async () => {
    if (!addItemId || !id) return;
    try {
      await addVanInventoryItem(id, addItemId, parseInt(addItemQty) || 0, parseInt(addItemMin) || 1);
      toast.success("Item added to van inventory");
      setAddItemOpen(false);
      setAddItemId("");
      setAddItemQty("1");
      setAddItemMin("1");
      fetchAll();
    } catch (e: unknown) { toast.error(errorMessage(e)); }
  };

  if (!van) return (
    <AppLayout title="Fleet">
      <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>
    </AppLayout>
  );

  return (
    <AppLayout title="Fleet">
      <div className="space-y-6">
        {/* Back + Title */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/fleet")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6 text-primary" /> {van.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {van.make && van.model ? `${van.year || ""} ${van.make} ${van.model}` : "Van details"}
            </p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="territory">Territory</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview">
            <Card className="border border-border/50">
              <CardHeader><CardTitle>Van Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <VehicleYMMSelector
                  value={{ year: String(editForm.year || ""), make: editForm.make || "", model: editForm.model || "" }}
                  onChange={(v) => setEditForm({ ...editForm, year: v.year, make: v.make, model: v.model })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>VIN</Label>
                    <div className="flex gap-2">
                      <Input
                        value={editForm.vin}
                        onChange={(e) => setEditForm({ ...editForm, vin: e.target.value.toUpperCase() })}
                        placeholder="Enter 17-character VIN"
                        maxLength={17}
                        className="font-mono flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleVinDecode}
                        disabled={vinDecoding || editForm.vin.trim().length !== 17}
                        className="gap-1 shrink-0"
                      >
                        {vinDecoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Decode
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Enter VIN and click Decode to auto-fill Year, Make &amp; Model</p>
                  </div>
                  <div className="space-y-2"><Label>License Plate</Label><Input value={editForm.license_plate} onChange={(e) => setEditForm({ ...editForm, license_plate: e.target.value })} /></div>
                </div>
                {technicians.length > 0 && (
                  <div className="space-y-2">
                    <Label>Assigned Technician</Label>
                    <Select value={editForm.assigned_technician_id} onValueChange={(v) => setEditForm({ ...editForm, assigned_technician_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select technician..." /></SelectTrigger>
                      <SelectContent>
                        {technicians.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editForm.assigned_technician_id && (
                      <button
                        type="button"
                        onClick={() => navigate(`/team-os?tech=${editForm.assigned_technician_id}`)}
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium mt-1"
                      >
                        <User className="h-3.5 w-3.5" />
                        View Technician Profile
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={handleSaveVan} className="gap-2"><Save className="h-4 w-4" />Save Changes</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TERRITORY TAB */}
          <TabsContent value="territory">
            <Card className="border border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Service Territory</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input placeholder="Enter zip code" value={newZip} onChange={(e) => setNewZip(e.target.value)} className="max-w-[200px]" onKeyDown={(e) => e.key === "Enter" && handleAddZip()} />
                  <Button onClick={handleAddZip} size="sm" className="gap-1"><Plus className="h-4 w-4" />Add</Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Bulk import (comma or newline separated)</Label>
                  <div className="flex gap-2">
                    <Input placeholder="90210, 90211, 90212..." value={bulkZips} onChange={(e) => setBulkZips(e.target.value)} />
                    <Button onClick={handleBulkAddZips} size="sm" variant="outline">Import</Button>
                  </div>
                </div>

                {territories.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No zip codes assigned. Add zip codes to define this van's service territory.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {territories.map(t => (
                      <Badge key={t.id} variant={t.is_primary ? "default" : "secondary"} className="gap-1 cursor-pointer group" onClick={() => handleTogglePrimary(t.id, t.is_primary)}>
                        {t.zip_code}
                        {t.is_primary && <span className="text-xs">(primary)</span>}
                        <button className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); handleRemoveZip(t.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="pt-4 border-t border-border">
                  <p className="font-medium mb-3 text-sm">Coverage Map</p>
                  <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
                    <TerritoryMap zipCodes={territories} />
                  </Suspense>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* INVENTORY TAB */}
          <TabsContent value="inventory">
            <Card className="border border-border/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Package className="h-5 w-5" />Van Inventory</CardTitle>
                  <div className="flex gap-2">
                    <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1"><RefreshCw className="h-4 w-4" />Restock</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Restock from Warehouse</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Item</Label>
                            <Select value={restockItemId} onValueChange={setRestockItemId}>
                              <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
                              <SelectContent>
                                {warehouseItems.filter(w => w.quantity > 0).map(w => (
                                  <SelectItem key={w.id} value={w.id}>{w.name} (warehouse: {w.quantity})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Quantity</Label>
                            <Input type="number" min="1" value={restockQty} onChange={(e) => setRestockQty(e.target.value)} />
                          </div>
                          <Button onClick={handleRestock} className="w-full">Restock Van</Button>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="gap-1"><Plus className="h-4 w-4" />Add Item</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Add Inventory Item to Van</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Item</Label>
                            <Select value={addItemId} onValueChange={setAddItemId}>
                              <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
                              <SelectContent>
                                {warehouseItems.map(w => (
                                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Initial Quantity</Label>
                              <Input type="number" min="0" value={addItemQty} onChange={(e) => setAddItemQty(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>Min Quantity (alert)</Label>
                              <Input type="number" min="0" value={addItemMin} onChange={(e) => setAddItemMin(e.target.value)} />
                            </div>
                          </div>
                          <Button onClick={handleAddInventoryItem} className="w-full">Add to Van</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {inventory.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No inventory items assigned to this van.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-center">Van Stock</TableHead>
                          <TableHead className="text-center">Min</TableHead>
                          <TableHead className="text-center">Warehouse</TableHead>
                          <TableHead>Last Restocked</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventory.map(item => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.item_name}</TableCell>
                            <TableCell className="font-mono text-sm">{item.item_sku || "—"}</TableCell>
                            <TableCell className="text-center">
                              <span className={item.quantity <= item.min_quantity ? "text-yellow-600 font-medium" : ""}>
                                {item.quantity}
                              </span>
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">{item.min_quantity}</TableCell>
                            <TableCell className="text-center text-muted-foreground">{item.warehouse_qty ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {item.last_restocked_at ? format(new Date(item.last_restocked_at), "MMM d, yyyy") : "Never"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SCHEDULE TAB */}
          <TabsContent value="schedule">
            <Card className="border border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Assigned Appointments</CardTitle>
              </CardHeader>
              <CardContent>
                {appointments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No appointments assigned to this van.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {appointments.map(appt => (
                          <TableRow key={appt.id} className="cursor-pointer" onClick={() => navigate(`/appointments/${appt.id}`)}>
                            <TableCell>{format(new Date(appt.scheduled_date), "MMM d, yyyy")}</TableCell>
                            <TableCell>{appt.scheduled_time}</TableCell>
                            <TableCell className="font-medium">{appt.title}</TableCell>
                            <TableCell>{appt.guest_name || "—"}</TableCell>
                            <TableCell><Badge variant="secondary">{appt.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default VanDetail;
