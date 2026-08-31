import { useEffect, useState, useCallback, useMemo } from "react";
import { VehicleYMMSelector } from "@/components/vehicles/VehicleYMMSelector";
import { format, parseISO } from "date-fns";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshContainer } from "@/components/ui/pull-to-refresh";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Car, Wrench, Edit, Trash2, UserX, Eye, Loader2, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import { useTerminology } from "@/contexts/TerminologyContext";
import { StatCard } from "@/components/dashboard/StatCard";
import { vehicleSchema, getFirstError } from "@/lib/validation";
import { useDebounce } from "@/hooks/useDebounce";
import { VinLookup } from "@/components/vehicles/VinLookup";
import { fetchVehicleOverview } from "@/application/queries";
import { fetchVehicleOverviewFromOffline } from "@/application/queries/vehicles.query";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";
import { createVehicle, updateVehicle, deleteVehicle } from "@/application/commands";
import { ListPagination, usePageSlice, DEFAULT_PAGE_SIZE } from "@/components/ui/list-pagination";

import type { Vehicle, Customer } from "@/shared/types";

const UNASSIGNED_VALUE = "__unassigned__";

const Vehicles = () => {
  const { terms } = useTerminology();
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});
  const [lastServiceDates, setLastServiceDates] = useState<Record<string, string>>({});
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState({
    customer_id: "",
    make: "",
    model: "",
    year: new Date().getFullYear(),
    vin: "",
    license_plate: "",
    plate_state: "",
    color: "",
    mileage: "",
    odometer_measure: "MI",
    notes: "",
    oil_type: "",
    oil_capacity: "",
  });


  const fetchVehiclesData = useCallback(async () => {
    setVehiclesLoading(true);
    setCustomersLoading(true);
    setVehiclesError(null);
    setCustomersError(null);

    try {
      if (await isOfflineEligibleForCurrentUser()) {
        const offlineSnapshot = await fetchVehicleOverviewFromOffline();
        if (offlineSnapshot) {
          setVehicles(offlineSnapshot.vehicles);
          setCustomers(offlineSnapshot.customers);
          setCustomerNames(offlineSnapshot.customerNames);
          setLastServiceDates(offlineSnapshot.lastServiceDates);

          // Local-first: render cached data immediately, then refresh from remote.
          setVehiclesLoading(false);
          setCustomersLoading(false);
        }
      }

      const { vehicles, customers, customerNames, lastServiceDates } = await fetchVehicleOverview();
      setVehicles(vehicles);
      setCustomers(customers);
      setCustomerNames(customerNames);
      setLastServiceDates(lastServiceDates);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch vehicles";
      setVehiclesError(message);
      setCustomersError(message);
      toast.error(message);
    } finally {
      setVehiclesLoading(false);
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchVehiclesData());
  }, [fetchVehiclesData]);

  const { containerRef, isRefreshing } = usePullToRefresh({
    onRefresh: fetchVehiclesData,
  });

  // Export vehicles as CSV
  const handleExport = useCallback(() => {
    if (!vehicles.length) return;
    const headers = ["Year", "Make", "Model", "VIN", "License Plate", "Color", "Mileage", "Owner", "Notes"];
    const rows = vehicles.map((v: Vehicle) => [
      v.year,
      v.make,
      v.model,
      v.vin || "",
      v.license_plate || "",
      v.color || "",
      v.mileage ?? "",
      customerNames[v.customer_id || ""] || "",
      v.notes || ""
    ]);
    const csv = [headers.join(","), ...rows.map((r: unknown[]) => r.map((x: unknown) => `"${String(x).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vehicles-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [vehicles, customerNames]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    const validationResult = vehicleSchema.safeParse({
      make: formData.make,
      model: formData.model,
      year: formData.year,
      vin: formData.vin,
      license_plate: formData.license_plate,
      color: formData.color,
      mileage: formData.mileage ? parseInt(formData.mileage) : null,
      notes: formData.notes,
    });
    
    if (!validationResult.success) {
      toast.error(getFirstError(validationResult) || "Validation error");
      return;
    }
    
    const vehicleData = {
      customer_id: formData.customer_id && formData.customer_id !== UNASSIGNED_VALUE ? formData.customer_id : null,
      make: validationResult.data.make,
      model: validationResult.data.model,
      year: validationResult.data.year,
      vin: validationResult.data.vin || null,
      license_plate: validationResult.data.license_plate || null,
      plate_state: formData.plate_state || null,
      color: validationResult.data.color || null,
      mileage: validationResult.data.mileage,
      odometer_measure: formData.odometer_measure || "MI",
      notes: validationResult.data.notes || null,
      oil_type: formData.oil_type || null,
      oil_capacity: formData.oil_capacity || null,
    };

    if (editingVehicle) {
      try {
        await updateVehicle(editingVehicle.id, vehicleData);
        toast.success("Updated successfully");
        setOpen(false);
        resetForm();
        fetchVehiclesData();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to update";
        toast.error(message);
      }
    } else {
      try {
        await createVehicle(vehicleData);
        toast.success("Created successfully");
        setOpen(false);
        resetForm();
        fetchVehiclesData();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to create";
        toast.error(message);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this vehicle?")) return;
    try {
      await deleteVehicle(id);
      toast.success("Deleted");
      fetchVehiclesData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete";
      toast.error(message);
    }
  };

  const resetForm = () => {
    setFormData({ customer_id: "", make: "", model: "", year: new Date().getFullYear(), vin: "", license_plate: "", plate_state: "", color: "", mileage: "", odometer_measure: "MI", notes: "", oil_type: "", oil_capacity: "" });
    setEditingVehicle(null);
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      customer_id: vehicle.customer_id || UNASSIGNED_VALUE,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin || "",
      license_plate: vehicle.license_plate || "",
      plate_state: vehicle.plate_state || "",
      color: vehicle.color || "",
      mileage: vehicle.mileage?.toString() || "",
      odometer_measure: vehicle.odometer_measure || "MI",
      notes: vehicle.notes || "",
      oil_type: vehicle.oil_type || "",
      oil_capacity: vehicle.oil_capacity || "",
    });
    setOpen(true);
  };

  // ⚡ Performance: Debounce search input to avoid re-filtering on every keystroke
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // YMM filter — uses same catalog dropdown as booking flow.
  // Persisted in localStorage so the selection survives refreshes & route changes.
  const YMM_FILTER_STORAGE_KEY = "vehicles.ymmFilter.v1";
  const [ymmFilter, setYmmFilter] = useState<{ year: string; make: string; model: string; engine?: string }>(() => {
    if (typeof window === "undefined") return { year: "", make: "", model: "" };
    try {
      const raw = window.localStorage.getItem(YMM_FILTER_STORAGE_KEY);
      if (!raw) return { year: "", make: "", model: "" };
      const parsed = JSON.parse(raw);
      return {
        year: typeof parsed?.year === "string" ? parsed.year : "",
        make: typeof parsed?.make === "string" ? parsed.make : "",
        model: typeof parsed?.model === "string" ? parsed.model : "",
        engine: typeof parsed?.engine === "string" ? parsed.engine : "",
      };
    } catch {
      return { year: "", make: "", model: "" };
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const hasAny = ymmFilter.year || ymmFilter.make || ymmFilter.model || ymmFilter.engine;
      if (hasAny) {
        window.localStorage.setItem(YMM_FILTER_STORAGE_KEY, JSON.stringify(ymmFilter));
      } else {
        window.localStorage.removeItem(YMM_FILTER_STORAGE_KEY);
      }
    } catch { /* ignore quota errors */ }
  }, [ymmFilter]);


  // ⚡ Performance: Memoize filtered list to prevent expensive re-filtering on unrelated state changes
  const filteredVehicles = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase().trim();
    return vehicles.filter(v => {
      if (ymmFilter.year && String(v.year) !== ymmFilter.year) return false;
      if (ymmFilter.make && (v.make || "").toLowerCase() !== ymmFilter.make.toLowerCase()) return false;
      if (ymmFilter.model && (v.model || "").toLowerCase() !== ymmFilter.model.toLowerCase()) return false;
      if (!q) return true;
      return (
        `${v.year} ${v.make} ${v.model}`.toLowerCase().includes(q) ||
        v.vin?.toLowerCase().includes(q) ||
        v.license_plate?.toLowerCase().includes(q)
      );
    });
  }, [vehicles, debouncedSearchQuery, ymmFilter]);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  useEffect(() => { void Promise.resolve().then(() => setPage(1)); }, [debouncedSearchQuery, pageSize, ymmFilter]);
  const pagedVehicles = usePageSlice(filteredVehicles, page, pageSize);

  // ⚡ Performance: Memoize derived statistics
  const inShopCount = useMemo(() =>
    vehicles.filter(v => v.notes?.toLowerCase().includes("in shop")).length,
    [vehicles]
  );

  return (
    <AppLayout title={`${terms.vehicle}s`}>
      <PullToRefreshContainer
        containerRef={containerRef}
        isRefreshing={isRefreshing}
      >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">{terms.vehicle} Registry</h2>
            <p className="text-sm sm:text-base text-muted-foreground">Manage and track all {terms.customer.toLowerCase()} {terms.vehicle.toLowerCase()}s in the system.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="gap-2 w-full sm:w-auto">
                  <Plus className="h-4 w-4" />
                  Add New {terms.vehicle}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingVehicle ? `Edit ${terms.vehicle}` : `Add New ${terms.vehicle}`}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>{terms.customer} (Optional)</Label>
                    <Select value={formData.customer_id || UNASSIGNED_VALUE} onValueChange={(value) => setFormData({ ...formData, customer_id: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED_VALUE}><span className="flex items-center gap-2"><UserX className="h-4 w-4" />Unassigned / Fleet</span></SelectItem>
                        {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* VIN Lookup */}
                  <VinLookup
                    licensePlate={formData.license_plate}
                    plateState={formData.plate_state}
                    onPlateChange={(plate) => setFormData({ ...formData, license_plate: plate })}
                    onStateChange={(state) => setFormData({ ...formData, plate_state: state })}
                    onVinFound={(result) => {
                      setFormData(prev => ({
                        ...prev,
                        vin: result.vin,
                        make: result.make,
                        model: result.model,
                        year: result.year,
                      }));
                    }}
                  />
                  <VehicleYMMSelector
                    required
                    value={{ year: formData.year ? String(formData.year) : "", make: formData.make, model: formData.model }}
                    onChange={(v) => setFormData({ ...formData, year: v.year ? parseInt(v.year) : formData.year, make: v.make, model: v.model })}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Color</Label><Input value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Mileage</Label><Input type="number" value={formData.mileage} onChange={(e) => setFormData({ ...formData, mileage: e.target.value })} /></div>
                    <div className="space-y-2">
                      <Label>Odometer Unit</Label>
                      <Select value={formData.odometer_measure} onValueChange={(value) => setFormData({ ...formData, odometer_measure: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MI">Miles (MI)</SelectItem>
                          <SelectItem value="KM">Kilometers (KM)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Oil Type</Label><Input value={formData.oil_type} onChange={(e) => setFormData({ ...formData, oil_type: e.target.value })} placeholder="e.g. 5W-30 Synthetic" /></div>
                    <div className="space-y-2"><Label>Oil Capacity (Quarts)</Label><Input type="number" value={formData.oil_capacity} onChange={(e) => setFormData({ ...formData, oil_capacity: e.target.value })} placeholder="e.g. 5.7" /></div>
                  </div>
                  <div className="space-y-2"><Label>VIN</Label><Input value={formData.vin} onChange={(e) => setFormData({ ...formData, vin: e.target.value.toUpperCase() })} maxLength={17} className="font-mono uppercase" placeholder="17-character VIN" /></div>
                  <div className="space-y-2"><Label>Notes</Label><Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} /></div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit">{editingVehicle ? "Update" : "Create"}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard title={`Total ${terms.vehicle}s`} value={vehicles.length} icon={Car} iconBgColor="bg-primary/10" iconColor="text-primary" />
          <StatCard title="Currently In Shop" value={inShopCount} icon={Wrench} iconBgColor="bg-yellow-500/10" iconColor="text-yellow-600" />
        </div>

        {/* Search + YMM Filter */}
        <Card className="border border-border/50">
          <CardContent className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by VIN, License Plate, or Owner Name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <VehicleYMMSelector value={ymmFilter} onChange={setYmmFilter} />
              </div>
              {(ymmFilter.year || ymmFilter.make || ymmFilter.model) && (
                <Button variant="outline" size="sm" onClick={() => setYmmFilter({ year: "", make: "", model: "" })}>Clear</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border border-border/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <Table density="compact">
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="font-medium">{terms.vehicle.toUpperCase()} INFO</TableHead>
                  <TableHead className="font-medium">VIN / LICENSE</TableHead>
                  <TableHead className="font-medium">OWNER</TableHead>
                  <TableHead className="font-medium">LAST {terms.service.toUpperCase()}</TableHead>
                  <TableHead className="font-medium">STATUS</TableHead>
                  <TableHead className="font-medium w-20">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehiclesLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></TableCell></TableRow>
                ) : vehiclesError ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-red-700 bg-red-50 rounded p-4">{vehiclesError}</TableCell></TableRow>
                ) : filteredVehicles.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No {terms.vehicle.toLowerCase()}s found</TableCell></TableRow>
                ) : (
                  pagedVehicles.map((v) => (
                    <TableRow key={v.id} className="border-border/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-16 bg-muted rounded-lg flex items-center justify-center">
                            <Car className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{v.year} {v.make} {v.model}</p>
                            <p className="text-sm text-muted-foreground">{v.color || "—"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-mono text-sm">{v.license_plate || "—"}</p>
                          <p className="text-xs text-muted-foreground">{v.vin ? `...${v.vin.slice(-4)}` : "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {v.customer_id ? (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {customerNames[v.customer_id]?.substring(0, 2).toUpperCase() || "??"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-primary">{customerNames[v.customer_id]}</span>
                          </div>
                        ) : (
                          <Badge variant="secondary">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {lastServiceDates[v.id] 
                          ? format(parseISO(lastServiceDates[v.id]), "MMM d, yyyy") 
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-gray-500/10 text-gray-600 hover:bg-gray-500/20">Ready</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/vehicles/${v.id}`)} title="View Details">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(v)}><Edit className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(v.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
            <ListPagination
              totalCount={filteredVehicles.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel={`${terms.vehicle.toLowerCase()}s`}
            />
          </CardContent>
        </Card>
      </div>
      </PullToRefreshContainer>
    </AppLayout>
  );
};

export default Vehicles;
