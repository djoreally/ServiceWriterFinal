import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchFleetVehicleProfile,
  fetchFleetVehicleWorkOrders,
  fetchVehicleSpecMatch,
  saveVehicleSpecification,
} from "@/application/queries/fleet-vehicle-profile.query";
import { fetchVehicleSpecifications } from "@/application/queries/vehicle-specifications.query";
import { VehicleFilterMatchCard } from "@/components/vehicles/VehicleFilterMatchCard";
import { invokeAIVehicleSpecs } from "@/application/queries/vehicle-specs.query";
import { AddVehicleDialog } from "@/components/fleet/AddVehicleDialog";
import { VehiclePartsManager } from "@/components/parts/VehiclePartsManager";
import { toast } from "@/components/ui/sonner";
import {
  ArrowLeft,
  Car,
  Hash,
  Gauge,
  Calendar,
  ClipboardList,
  Wrench,
  ChevronRight,
  FileText,
  Building2,
  MapPin,
  Plus,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";

interface VehicleProfile {
  id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  license_plate: string | null;
  mileage: number | null;
  unit_number: string | null;
  status: string;
  notes: string | null;
  color: string | null;
  fuel_type: string | null;
  last_service_date: string | null;
  last_service_mileage: number | null;
  next_service_date: string | null;
  next_service_mileage: number | null;
  due_status: string | null;
  created_at: string;
  fleet_clients?: { id: string; company_name: string | null } | null;
  fleet_locations?: { id: string; name: string | null } | null;
  fleet_contracts?: { id: string; name: string | null } | null;
}

interface VehicleWorkOrder {
  id: string;
  order_number: string | null;
  status: string;
  service_type: string | null;
  scheduled_date: string | null;
  total: number | null;
  completed_at: string | null;
}

interface VehicleSpec {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  oil_capacity: string | null;
  oil_type: string | null;
  oil_filter: string | null;
  air_filter: string | null;
  cabin_filter: string | null;
  fuel_filter: string | null;
  wiper_blade_driver: string | null;
  wiper_blade_passenger: string | null;
  wiper_blade_rear: string | null;
  transmission_fluid: string | null;
  coolant_type: string | null;
  brake_fluid: string | null;
  tire_size: string | null;
}

type SpecEditableField =
  | "oil_capacity"
  | "oil_type"
  | "oil_filter"
  | "air_filter"
  | "cabin_filter"
  | "fuel_filter"
  | "brake_fluid"
  | "coolant_type"
  | "transmission_fluid"
  | "tire_size"
  | "wiper_blade_driver"
  | "wiper_blade_passenger"
  | "wiper_blade_rear";

const specFields: Array<{ name: SpecEditableField; label: string; mono?: boolean; placeholder?: string }> = [
  { name: "oil_capacity", label: "Oil Capacity", placeholder: "7.0 qts with filter" },
  { name: "oil_type", label: "Oil Type", placeholder: "0W-20" },
  { name: "oil_filter", label: "Oil Filter", mono: true },
  { name: "air_filter", label: "Air Filter", mono: true },
  { name: "cabin_filter", label: "Cabin Filter", mono: true },
  { name: "fuel_filter", label: "Fuel Filter", mono: true },
  { name: "brake_fluid", label: "Brake Fluid" },
  { name: "coolant_type", label: "Coolant Type" },
  { name: "transmission_fluid", label: "Transmission Fluid" },
  { name: "tire_size", label: "Tire Size" },
  { name: "wiper_blade_driver", label: "Wiper (Driver)" },
  { name: "wiper_blade_passenger", label: "Wiper (Passenger)" },
  { name: "wiper_blade_rear", label: "Wiper (Rear)" },
];

function getEmptySpecForm(): Record<SpecEditableField, string> {
  return specFields.reduce((acc, field) => ({ ...acc, [field.name]: "" }), {} as Record<SpecEditableField, string>);
}

function getSpecFormFromSpecs(spec: VehicleSpec | null): Record<SpecEditableField, string> {
  const form = getEmptySpecForm();
  if (!spec) return form;
  for (const field of specFields) form[field.name] = spec[field.name] ?? "";
  return form;
}

const statusStyles: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  inactive: "bg-muted text-muted-foreground",
  maintenance: "bg-amber-500/10 text-amber-600",
  retired: "bg-red-500/10 text-red-500",
};

const woStatusStyles: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-yellow-500/10 text-yellow-600",
  scheduled: "bg-blue-500/10 text-blue-600",
  assigned: "bg-indigo-500/10 text-indigo-600",
  in_progress: "bg-amber-500/10 text-amber-600",
  completed: "bg-emerald-500/10 text-emerald-600",
  invoiced: "bg-purple-500/10 text-purple-600",
  paid: "bg-gray-500/10 text-gray-600",
};

const FleetVehicleProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<VehicleProfile | null>(null);
  const [workOrders, setWorkOrders] = useState<VehicleWorkOrder[]>([]);
  const [specs, setSpecs] = useState<VehicleSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [specsEditing, setSpecsEditing] = useState(false);
  const [specsSaving, setSpecsSaving] = useState(false);
  const [specForm, setSpecForm] = useState<Record<SpecEditableField, string>>(getEmptySpecForm());

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [vRes, woRes] = await Promise.all([
        fetchFleetVehicleProfile(id),
        fetchFleetVehicleWorkOrders(id),
      ]);

      if (vRes.error || !vRes.data) {
        toast.error("Vehicle not found");
        return;
      }

      setVehicle(vRes.data as unknown as VehicleProfile);
      setWorkOrders((woRes.data as VehicleWorkOrder[]) ?? []);

      // Try to find vehicle specs — exact match → wildcard → AI auto-populate.
      if (vRes.data.year && vRes.data.make && vRes.data.model) {
        const year = vRes.data.year as number;
        const make = vRes.data.make as string;
        const model = vRes.data.model as string;

        let specData: VehicleSpec | null = null;
        const exact = await fetchVehicleSpecMatch(year, make, model);
        if (exact.data) {
          specData = exact.data as VehicleSpec;
        } else {
          const wildcard = await fetchVehicleSpecifications(year, make, model);
          if (wildcard.length > 0) specData = wildcard[0] as unknown as VehicleSpec;
        }

        if (!specData) {
          try {
            const ai = await invokeAIVehicleSpecs(year, make, model);
            const primaryEngine = ai.data?.engines?.[0];
            const aiSpec = primaryEngine ? ai.data?.specs?.[primaryEngine] : null;
            if (aiSpec) {
              specData = {
                id: "",
                year,
                make,
                model,
                engine: primaryEngine ?? null,
                oil_capacity: aiSpec.oil_capacity ?? null,
                oil_type: aiSpec.oil_type ?? null,
                oil_filter: null,
                air_filter: null,
                cabin_filter: null,
                fuel_filter: null,
                wiper_blade_driver: null,
                wiper_blade_passenger: null,
                wiper_blade_rear: null,
                transmission_fluid: aiSpec.transmission_fluid ?? null,
                coolant_type: null,
                brake_fluid: null,
                tire_size: null,
              } as VehicleSpec;
            }
          } catch (aiErr) {
            console.warn("[FleetVehicleProfile] AI spec fetch failed", aiErr);
          }
        }

        setSpecs(specData);
        setSpecForm(getSpecFormFromSpecs(specData));
      } else {
        setSpecs(null);
        setSpecForm(getEmptySpecForm());
      }
    } catch (err) {
      console.error("Failed to load vehicle profile", err);
      toast.error("Failed to load vehicle");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void Promise.resolve().then(() => fetchData()); }, [fetchData]);

  if (loading) {
    return (
      <FleetOSLayout title="Vehicle">
        <div className="space-y-3">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </FleetOSLayout>
    );
  }

  if (!vehicle) {
    return (
      <FleetOSLayout title="Vehicle">
        <div className="text-center py-12">
          <Car className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Vehicle not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </FleetOSLayout>
    );
  }


  const handleSaveSpecs = async () => {
    if (!vehicle?.year || !vehicle.make || !vehicle.model) {
      toast.error("Vehicle year, make, and model are required before adding specs.");
      return;
    }

    // Validate + normalize fluid quantity fields before persisting.
    const fluidFields: Array<{ name: SpecEditableField; label: string; opts?: import("@/lib/fluidQuantity").FluidQuantityOptions }> = [
      { name: "oil_capacity", label: "Oil capacity", opts: { minQuarts: 2, maxQuarts: 20, warnAboveQuarts: 12 } },
      { name: "transmission_fluid", label: "Transmission fluid", opts: { minQuarts: 1, maxQuarts: 30, warnAboveQuarts: 20, keepQualifier: true } },
    ];

    const normalizedForm: Record<SpecEditableField, string> = { ...specForm };
    for (const f of fluidFields) {
      const raw = specForm[f.name];
      if (!raw || !raw.trim()) continue;
      // Only numeric-style inputs are normalized. Skip pure text like "Dexron VI".
      if (!/\d/.test(raw)) continue;
      const { normalizeFluidQuantity } = await import("@/lib/fluidQuantity");
      const res = normalizeFluidQuantity(raw, f.opts);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.warning) toast.warning(res.warning);
      if (res.normalized) normalizedForm[f.name] = res.normalized;
    }

    setSpecsSaving(true);
    try {
      const payload = {
        id: specs?.id,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        engine: specs?.engine ?? vehicle.engine ?? null,
        ...Object.fromEntries(
          specFields.map((field) => [field.name, normalizedForm[field.name].trim() || null]),
        ),
      };
      const { data, error } = await saveVehicleSpecification(payload);
      if (error) throw error;
      setSpecs(data as VehicleSpec);
      setSpecForm(getSpecFormFromSpecs(data as VehicleSpec));
      setSpecsEditing(false);
      toast.success("Vehicle specifications saved");
    } catch (err) {
      console.error("Failed to save vehicle specs", err);
      toast.error("Failed to save vehicle specifications");
    } finally {
      setSpecsSaving(false);
    }
  };

  const completedOrders = workOrders.filter(wo => wo.status === "completed" || wo.status === "invoiced" || wo.status === "paid");
  const scheduledOrders = workOrders.filter(wo => ["draft", "pending_review", "scheduled", "assigned", "in_progress"].includes(wo.status));

  return (
    <FleetOSLayout title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{vehicle.year} {vehicle.make} {vehicle.model}</h2>
              <Badge variant="secondary" className={statusStyles[vehicle.status] || ""}>{vehicle.status}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
              {vehicle.unit_number && <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {vehicle.unit_number}</span>}
              {vehicle.vin && <span className="font-mono text-xs">{vehicle.vin}</span>}
              {vehicle.license_plate && <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">{vehicle.license_plate}</span>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
          <Button size="sm" onClick={() => navigate(`/fleet-os/work-orders/new?vehicleId=${vehicle.id}`)}>
            <Plus className="h-4 w-4 mr-1" /> New Work Order
          </Button>
        </div>

        {/* Info Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase text-muted-foreground">Mileage</span>
              </div>
              <p className="text-lg font-bold">{vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase text-muted-foreground">Last Service</span>
              </div>
              <p className="text-lg font-bold">{vehicle.last_service_date || "—"}</p>
              {vehicle.last_service_mileage && <p className="text-xs text-muted-foreground">{vehicle.last_service_mileage.toLocaleString()} mi</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase text-muted-foreground">Work Orders</span>
              </div>
              <p className="text-lg font-bold">{workOrders.length}</p>
              <p className="text-xs text-muted-foreground">{completedOrders.length} completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase text-muted-foreground">Client</span>
              </div>
              {vehicle.fleet_clients ? (
                <Button variant="link" className="h-auto p-0 text-sm" onClick={() => navigate(`/fleet-os/clients/${vehicle.fleet_clients!.id}`)}>
                  {vehicle.fleet_clients.company_name}
                </Button>
              ) : <p className="text-sm">—</p>}
            </CardContent>
          </Card>
        </div>

        {/* Vehicle Details */}
        <Card>
          <CardContent className="p-5">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div><span className="text-xs font-semibold text-muted-foreground">VIN</span><p className="font-mono">{vehicle.vin || "—"}</p></div>
              <div><span className="text-xs font-semibold text-muted-foreground">Engine</span><p>{vehicle.engine || "—"}</p></div>
              <div><span className="text-xs font-semibold text-muted-foreground">Fuel Type</span><p>{vehicle.fuel_type || "—"}</p></div>
              <div><span className="text-xs font-semibold text-muted-foreground">Color</span><p>{vehicle.color || "—"}</p></div>
              <div><span className="text-xs font-semibold text-muted-foreground">Next Service Date</span><p>{vehicle.next_service_date || "—"}</p></div>
              <div><span className="text-xs font-semibold text-muted-foreground">Next Service Mileage</span><p>{vehicle.next_service_mileage ? `${vehicle.next_service_mileage.toLocaleString()} mi` : "—"}</p></div>
              {vehicle.fleet_locations && (
                <div><span className="text-xs font-semibold text-muted-foreground">Location</span><p className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {vehicle.fleet_locations.name}</p></div>
              )}
              {vehicle.fleet_contracts && (
                <div><span className="text-xs font-semibold text-muted-foreground">Contract</span><p className="flex items-center gap-1"><FileText className="h-3 w-3" /> {vehicle.fleet_contracts.name}</p></div>
              )}
              {vehicle.due_status && (
                <div><span className="text-xs font-semibold text-muted-foreground">Due Status</span><Badge variant="secondary">{vehicle.due_status}</Badge></div>
              )}
            </div>
            {vehicle.notes && <p className="text-sm text-muted-foreground mt-3 italic">{vehicle.notes}</p>}
          </CardContent>
        </Card>

        <Tabs defaultValue="work-orders">
          <TabsList>
            <TabsTrigger value="work-orders">Work Orders ({workOrders.length})</TabsTrigger>
            <TabsTrigger value="parts">Parts</TabsTrigger>
            <TabsTrigger value="specs">Vehicle Specs</TabsTrigger>
          </TabsList>

          <TabsContent value="parts" className="mt-4">
            <VehiclePartsManager
              vehicleKind="fleet"
              vehicleId={vehicle.id}
              vehicleLabel={[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
              year={vehicle.year}
              make={vehicle.make}
              model={vehicle.model}
              engine={vehicle.engine}
            />
          </TabsContent>


          <TabsContent value="work-orders" className="space-y-4 mt-4">
            {scheduledOrders.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Scheduled / In Progress</p>
                <div className="space-y-2">
                  {scheduledOrders.map(wo => (
                    <Card key={wo.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(`/fleet-os/work-orders/${wo.id}`)}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{wo.order_number || "—"}</p>
                            <Badge variant="secondary" className={woStatusStyles[wo.status] || ""}>{wo.status.replace("_", " ")}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {wo.service_type} {wo.scheduled_date && `• ${wo.scheduled_date}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {wo.total != null && wo.total > 0 && <span className="text-sm font-medium">${wo.total.toFixed(2)}</span>}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            {completedOrders.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Service History</p>
                <div className="space-y-2">
                  {completedOrders.map(wo => (
                    <Card key={wo.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(`/fleet-os/work-orders/${wo.id}`)}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{wo.order_number || "—"}</p>
                            <Badge variant="secondary" className={woStatusStyles[wo.status] || ""}>{wo.status.replace("_", " ")}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {wo.service_type} {wo.completed_at && `• Completed ${format(new Date(wo.completed_at), "MMM d, yyyy")}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {wo.total != null && wo.total > 0 && <span className="text-sm font-medium">${wo.total.toFixed(2)}</span>}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            {workOrders.length === 0 && (
              <Card><CardContent className="py-12 text-center">
                <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No work orders for this vehicle</p>
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="specs" className="mt-4 space-y-4">
            <VehicleFilterMatchCard
              title="Filter match"
              year={vehicle.year}
              make={vehicle.make}
              model={vehicle.model}
              engine={vehicle.engine}
              vehicleKind="fleet"
              vehicleId={vehicle.id}
              allowConfirm
            />
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Parts & Specifications</CardTitle>
                <div className="flex gap-2">
                  {specsEditing && (
                    <Button variant="outline" size="sm" onClick={() => { setSpecForm(getSpecFormFromSpecs(specs)); setSpecsEditing(false); }} disabled={specsSaving}>
                      Cancel
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={specsEditing ? handleSaveSpecs : () => setSpecsEditing(true)}
                    disabled={specsSaving || !vehicle.year || !vehicle.make || !vehicle.model}
                  >
                    {specsEditing ? (specsSaving ? "Saving..." : "Save Specs") : specs ? "Edit Specs" : "Add Specs"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {specsEditing ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {specFields.map((field) => (
                      <div key={field.name} className="space-y-2">
                        <Label htmlFor={`spec-${field.name}`}>{field.label}</Label>
                        <Input
                          id={`spec-${field.name}`}
                          className={field.mono ? "font-mono" : undefined}
                          value={specForm[field.name]}
                          placeholder={field.placeholder}
                          onChange={(event) => setSpecForm((current) => ({ ...current, [field.name]: event.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    {specFields.map((field) => (
                      <div key={field.name}>
                        <span className="text-xs font-semibold text-muted-foreground">{field.label}</span>
                        <p className={field.mono ? "font-mono" : undefined}>{specs?.[field.name] || "—"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <AddVehicleDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onCreated={() => { setEditOpen(false); fetchData(); }}
        editingVehicle={vehicle}
      />
    </FleetOSLayout>
  );
};

export default FleetVehicleProfilePage;
