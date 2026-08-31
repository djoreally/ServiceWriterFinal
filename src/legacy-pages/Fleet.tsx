import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { VehicleYMMSelector } from "@/components/vehicles/VehicleYMMSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Truck, MapPin, Package, Users, Grid3X3, Map } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { StatCard } from "@/components/dashboard/StatCard";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { PullToRefreshContainer } from "@/components/ui/pull-to-refresh";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import {
  fetchFleetVansOverview,
  fetchFleetMapData,
  type FleetVanSummary,
  type FleetTechnicianSummary,
  
} from "@/application/queries";
import { createVan } from "@/application/commands";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { type VanMapData } from "@/components/fleet/FleetCommandMap";
import { getSemanticStatus } from "@/lib/semantic-status";

const FleetCommandMap = lazy(() =>
  import("@/components/fleet/FleetCommandMap").then(m => ({ default: m.FleetCommandMap }))
);

const Fleet = () => {
  const navigate = useNavigate();
  const [vans, setVans] = useState<FleetVanSummary[]>([]);
  const [technicians, setTechnicians] = useState<FleetTechnicianSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeView, setActiveView] = useState("grid");
  const [mapVans, setMapVans] = useState<VanMapData[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    vin: "",
    license_plate: "",
    make: "",
    model: "",
    year: "",
    assigned_technician_id: "",
  });

  const fetchData = useCallback(async () => {
    try {
      const { vans: vansResult, technicians: techs } = await fetchFleetVansOverview();
      setVans(vansResult);
      setTechnicians(techs);
    } catch (error) {
      console.error("Failed to fetch fleet vans", error);
      toast.error("Failed to fetch fleet");
    }
  }, []);

  // Fetch enriched map data via application layer
  const fetchMapData = useCallback(async () => {
    try {
      const enriched = await fetchFleetMapData();
      setMapVans(enriched as VanMapData[]);
    } catch (error) {
      console.error("Failed to fetch fleet map data", error);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => fetchData()); void Promise.resolve().then(() => fetchMapData()); }, [fetchData, fetchMapData]);

  const { containerRef, isRefreshing } = usePullToRefresh({
    onRefresh: async () => { await Promise.all([fetchData(), fetchMapData()]); }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { toast.error("Van name is required"); return; }

    try {
      await createVan({
        name: formData.name,
        vin: formData.vin || null,
        license_plate: formData.license_plate || null,
        make: formData.make || null,
        model: formData.model || null,
        year: formData.year ? parseInt(formData.year) : null,
        assigned_technician_id: formData.assigned_technician_id || null,
      });

      toast.success("Van created");
      setOpen(false);
      setFormData({ name: "", vin: "", license_plate: "", make: "", model: "", year: "", assigned_technician_id: "" });
      fetchData();
      fetchMapData();
    } catch (error) {
      console.error("Failed to create van", error);
      toast.error("Failed to create van");
    }
  };

  const filteredVans = vans.filter(van =>
    van.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    van.license_plate?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    van.technician_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeVans = vans.filter(v => v.status === "active").length;
  const totalTerritories = vans.reduce((sum, v) => sum + (v.territory_count || 0), 0);

  const getFleetStatusColor = (status: string) =>
    getSemanticStatus("fleetAsset", status).badgeClass;

  return (
    <AppLayout title="Fleet">
      <PullToRefreshContainer containerRef={containerRef} isRefreshing={isRefreshing}>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold">Fleet Command Center</h2>
              <p className="text-sm sm:text-base text-muted-foreground">Vans, territories, technicians, and live dispatch overview</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 w-full sm:w-auto"><Plus className="h-4 w-4" />Add Van</Button>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Add New Van</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Van Name *</Label>
                    <Input placeholder='e.g. "Van #1" or "North Route"' value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <VehicleYMMSelector
                    value={{ year: String(formData.year || ""), make: formData.make || "", model: formData.model || "" }}
                    onChange={(v) => setFormData({ ...formData, year: v.year, make: v.make, model: v.model })}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>VIN</Label><Input value={formData.vin} onChange={(e) => setFormData({ ...formData, vin: e.target.value })} /></div>
                    <div className="space-y-2"><Label>License Plate</Label><Input value={formData.license_plate} onChange={(e) => setFormData({ ...formData, license_plate: e.target.value })} /></div>
                  </div>
                  {technicians.length > 0 && (
                    <div className="space-y-2">
                      <Label>Assign Technician</Label>
                      <Select value={formData.assigned_technician_id} onValueChange={(v) => setFormData({ ...formData, assigned_technician_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select technician..." /></SelectTrigger>
                        <SelectContent>
                          {technicians.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit">Create Van</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="Total Vans" value={vans.length} icon={Truck} iconBgColor="bg-primary/10" iconColor="text-primary" />
            <StatCard title="Active Vans" value={activeVans} icon={Users} subtitle={`${vans.length - activeVans} inactive`} iconBgColor="bg-gray-500/10" iconColor="text-gray-600" />
            <StatCard title="Zip Codes Covered" value={totalTerritories} icon={MapPin} iconBgColor="bg-blue-500/10" iconColor="text-blue-600" />
          </div>

          {/* Grid / Map View Toggle */}
          <Tabs value={activeView} onValueChange={setActiveView}>
            <div className="flex items-center gap-4 flex-wrap">
              <TabsList>
                <TabsTrigger value="grid" className="gap-1.5"><Grid3X3 className="h-3.5 w-3.5" />Grid</TabsTrigger>
                <TabsTrigger value="map" className="gap-1.5"><Map className="h-3.5 w-3.5" />Command Map</TabsTrigger>
              </TabsList>
              {activeView === "grid" && (
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search vans…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-9"
                  />
                </div>
              )}
            </div>

            {/* ── GRID VIEW ── */}
            <TabsContent value="grid" className="mt-4">
              {filteredVans.length === 0 ? (
                <Card className="border border-border/50">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Truck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No vans yet</p>
                    <p className="text-sm">Add your first van to start managing your fleet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredVans.map((van) => (
                    <Card
                      key={van.id}
                      className="border border-border/50 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => navigate(`/fleet/${van.id}`)}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                              <Truck className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-semibold">{van.name}</p>
                              {van.make && van.model && (
                                <p className="text-xs text-muted-foreground">{van.year} {van.make} {van.model}</p>
                              )}
                            </div>
                          </div>
                          <Badge className={getFleetStatusColor(van.status)} variant="secondary">{van.status}</Badge>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />
                            <span>{van.technician_name || "No technician assigned"}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{van.territory_count} zip code{van.territory_count !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Package className="h-3.5 w-3.5" />
                            <span>{van.inventory_count} inventory item{van.inventory_count !== 1 ? "s" : ""}</span>
                          </div>
                          {van.license_plate && (
                            <p className="text-xs font-mono text-muted-foreground">Plate: {van.license_plate}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── COMMAND MAP VIEW ── */}
            <TabsContent value="map" className="mt-4">
              <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-lg" />}>
                <FleetCommandMap vans={mapVans} height="h-[600px]" />
              </Suspense>
              {mapVans.length === 0 && (
                <p className="text-center text-sm text-muted-foreground mt-3">
                  Add vans and assign territory zip codes to see them on the command map.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </PullToRefreshContainer>
    </AppLayout>
  );
};

export default Fleet;
