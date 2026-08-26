import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { ArrowLeft, Calendar, Car, ClipboardList, FileCheck2, Plus, Send } from "lucide-react";
import { fetchFleetWorkOrderCreateOptions, fetchAvailability, type FleetWorkOrderCreateOptions } from "@/application/queries";
import { createFleetWorkOrder, type CreateFleetWorkOrderResult } from "@/application/commands";
import { resolveServiceDefaultsForVehicle } from "@/application/services/service-defaults/service-defaults.service";
import { logAudit } from "@/lib/security/audit";
import { useAuth } from "@packages/auth";
import { AddVehicleDialog } from "@/components/fleet/AddVehicleDialog";

type WizardStep = "asset" | "service" | "schedule" | "review";

type StructuredPackage = {
  code: string;
  label: string;
  oilSpec: string | null;
  oilCapacityQuarts: number | null;
  baseLaborServicePackage: string | null;
  checklist: string[];
  estimatedDurationMinutes: number;
};

const FleetWorkOrderCreatePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillVehicleId = searchParams.get("vehicleId") || "";
  const { user } = useAuth();

  const [options, setOptions] = useState<FleetWorkOrderCreateOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<WizardStep>("asset");
  const [showAddVehicleDialog, setShowAddVehicleDialog] = useState(false);

  const [clientId, setClientId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [serviceProfileId, setServiceProfileId] = useState("");
  const [packageCode, setPackageCode] = useState("");
  const [priority, setPriority] = useState("normal");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [availableSlots, setAvailableSlots] = useState<Array<{ time: string; available: boolean }>>([]);
  const [poNumber, setPoNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [serviceDefaults, setServiceDefaults] = useState<{
    oilSpec: string;
    oilCapacityQuarts: number;
    recommendedServiceType: string;
    baseLaborServicePackage: string;
    source: "vehicle_intelligence" | "derived_fallback" | "manual";
  } | null>(null);

  const loadOptions = async () => {
    setLoading(true);
    try {
      const data = await fetchFleetWorkOrderCreateOptions();
      setOptions(data);
      return data;
    } catch (err) {
      console.error("[FleetWorkOrderCreatePage] Failed to load options", err);
      toast.error("Failed to load work order data");
    } finally {
      setLoading(false);
    }
    return null;
  };

  useEffect(() => {
    void loadOptions();
  }, []);

  // Prefill from ?vehicleId= if provided (e.g. when launched from vehicle profile)
  useEffect(() => {
    if (!prefillVehicleId || !options || vehicleId) return;
    const exists = options.vehicles.find((v) => v.id === prefillVehicleId);
    if (exists) {
      setClientId(exists.fleet_client_id || "");
      void handleVehicleSelect(prefillVehicleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillVehicleId, options]);

  const selectedVehicle = useMemo(
    () => options?.vehicles.find((v) => v.id === vehicleId) || null,
    [options?.vehicles, vehicleId]
  );

  const selectedContract = useMemo(
    () => options?.contracts.find((c) => c.id === selectedVehicle?.fleet_contract_id) || null,
    [options?.contracts, selectedVehicle?.fleet_contract_id]
  );

  const selectedLocation = useMemo(
    () => options?.locations.find((l) => l.id === selectedVehicle?.fleet_location_id) || null,
    [options?.locations, selectedVehicle?.fleet_location_id]
  );

  // Work orders are client-specific: after a client is selected, only that
  // client's vehicles can be selected or used to create a work order.
  const eligibleVehicles = useMemo(
    () => (options?.vehicles || []).filter((v) => !!v.fleet_client_id && (!clientId || v.fleet_client_id === clientId)),
    [clientId, options?.vehicles]
  );

  const serviceProfiles = useMemo(
    () => (options?.serviceProfiles || []).filter((p) => p.fleet_client_id === clientId),
    [clientId, options?.serviceProfiles]
  );

  const selectedProfile = useMemo(
    () => serviceProfiles.find((p) => p.id === serviceProfileId) || null,
    [serviceProfiles, serviceProfileId]
  );

  const packageOptions = useMemo<StructuredPackage[]>(() => {
    if (!selectedProfile || !serviceDefaults) return [];

    return [
      {
        code: "contract_standard",
        label: `${selectedProfile.service_class} — Standard`,
        oilSpec: serviceDefaults.oilSpec || null,
        oilCapacityQuarts: serviceDefaults.oilCapacityQuarts || null,
        baseLaborServicePackage: selectedProfile.base_labor_package || serviceDefaults.baseLaborServicePackage || null,
        checklist: ["Vehicle safety check", "Fluid level verification", "Photo documentation", "Post-service QA"],
        estimatedDurationMinutes: 60,
      },
      {
        code: "contract_extended",
        label: `${selectedProfile.service_class} — Extended Inspection`,
        oilSpec: serviceDefaults.oilSpec || null,
        oilCapacityQuarts: serviceDefaults.oilCapacityQuarts || null,
        baseLaborServicePackage: selectedProfile.base_labor_package || serviceDefaults.baseLaborServicePackage || null,
        checklist: ["Vehicle safety check", "Fluid level verification", "Tire and brake inspection", "Battery and charging system check", "Photo documentation", "Post-service QA"],
        estimatedDurationMinutes: 90,
      },
    ];
  }, [selectedProfile, serviceDefaults]);

  const selectedPackage = useMemo(
    () => packageOptions.find((pkg) => pkg.code === packageCode) || null,
    [packageCode, packageOptions]
  );

  const pricingRules = (selectedContract?.pricing_rules as Record<string, unknown> | null) ?? null;
  const poRequired = Boolean(pricingRules?.requires_po) || Boolean(pricingRules?.po_required) || Boolean(pricingRules?.poRequired);

  const validPOs = useMemo(() => {
    if (!selectedVehicle?.fleet_client_id) return [];
    return (options?.purchaseOrders || []).filter((po) => {
      const authorized = Number(po.amount_authorized || 0);
      const remaining = Number(po.amount_limit || 0) - authorized;
      return po.fleet_client_id === selectedVehicle.fleet_client_id && ["open", "partially_used"].includes(String(po.status || "")) && remaining > 0;
    }).sort((a, b) => {
      const aRemaining = Number(a.amount_limit || 0) - Number(a.amount_authorized || 0);
      const bRemaining = Number(b.amount_limit || 0) - Number(b.amount_authorized || 0);
      return bRemaining - aRemaining;
    });
  }, [options?.purchaseOrders, selectedVehicle?.fleet_client_id]);

  const handleVehicleSelect = async (value: string, optionOverride?: FleetWorkOrderCreateOptions | null) => {
    setVehicleId(value);
    setServiceProfileId("");
    setPackageCode("");
    setScheduledDate("");
    setScheduledTime("");
    setAvailableSlots([]);

    const vehicle = (optionOverride ?? options)?.vehicles.find((v) => v.id === value);
    if (!vehicle || !user?.id) return;

    if (!vehicle.fleet_client_id) {
      toast.error("Vehicle must belong to a fleet client.");
      return;
    }
    if (clientId && vehicle.fleet_client_id !== clientId) {
      toast.error("Vehicle must belong to the selected fleet client.");
      return;
    }
    if (!clientId) {
      setClientId(vehicle.fleet_client_id);
    }
    if (!vehicle.fleet_contract_id || !vehicle.fleet_location_id) {
      toast.warning("Vehicle is missing contract or location — you can still continue.");
    }

    const defaults = await resolveServiceDefaultsForVehicle({
      vehicleId: vehicle.id,
      userId: user.id,
      vin: vehicle.vin,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
    });

    if (!defaults) {
      toast.error("Unable to resolve service defaults for selected vehicle.");
      return;
    }

    setServiceDefaults(defaults);
    setStep("service");
  };

  const handleClientSelect = (value: string) => {
    setClientId(value);
    setVehicleId("");
    setServiceProfileId("");
    setPackageCode("");
    setScheduledDate("");
    setScheduledTime("");
    setAvailableSlots([]);
    setPoNumber("");
    setServiceDefaults(null);
    setStep("asset");
  };

  const handleVehicleCreated = async (newVehicleId?: string) => {
    const refreshedOptions = await loadOptions();
    if (newVehicleId) {
      const newVehicle = refreshedOptions?.vehicles.find((v) => v.id === newVehicleId);
      if (newVehicle?.fleet_client_id) setClientId(newVehicle.fleet_client_id);
      void handleVehicleSelect(newVehicleId, refreshedOptions);
    }
  };

  useEffect(() => {
    const loadSlots = async () => {
      if (!user?.id || !scheduledDate || !selectedLocation || !selectedPackage) {
        setAvailableSlots([]);
        return;
      }

      const opening = selectedLocation.service_window_start || "08:00";
      const closing = selectedLocation.service_window_end || "17:00";

      try {
        const slots = await fetchAvailability(
          user.id,
          scheduledDate,
          opening,
          closing,
          30,
          selectedPackage.estimatedDurationMinutes,
          0,
          0
        );
        setAvailableSlots(slots.filter((slot) => slot.available));
        setScheduledTime("");
      } catch (error) {
        console.error("[FleetWorkOrderCreatePage] Failed to load availability", error);
        toast.error("Failed to load valid schedule slots");
      }
    };

    void loadSlots();
  }, [user?.id, scheduledDate, selectedLocation, selectedPackage]);

  const validateBeforeSubmit = () => {
    if (!selectedVehicle || !selectedVehicle.fleet_client_id) {
      return "Select a vehicle with a fleet client.";
    }
    if (!selectedProfile) return "Select a service profile.";
    if (!selectedPackage) return "Select a service package.";
    if (!scheduledDate || !scheduledTime) return "Select a valid schedule slot.";
    if (!availableSlots.some((slot) => slot.time === scheduledTime)) return "Selected schedule slot is not available.";
    if (poRequired && !poNumber) return "PO is required for this contract.";
    if (poNumber && !validPOs.some((po) => po.po_number === poNumber)) return "PO is invalid or exhausted.";
    return null;
  };

  const submit = async () => {
    const validationError = validateBeforeSubmit();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!selectedVehicle || !selectedPackage || !selectedProfile || !serviceDefaults) return;

    setSubmitting(true);
    try {
      await logAudit({
        action: "appointment.created",
        status: "success",
        details: {
          stage: "pre_submit_validation_passed",
          fleet_vehicle_id: selectedVehicle.id,
          fleet_contract_id: selectedVehicle.fleet_contract_id,
          fleet_location_id: selectedVehicle.fleet_location_id,
          service_profile_id: selectedProfile.id,
          service_package: selectedPackage.code,
        },
        resource_type: "fleet_work_orders",
      });

      const result: CreateFleetWorkOrderResult = await createFleetWorkOrder({
        clientId: selectedVehicle.fleet_client_id,
        vehicleId: selectedVehicle.id,
        contractId: selectedVehicle.fleet_contract_id,
        locationId: selectedVehicle.fleet_location_id,
        serviceProfileId: selectedProfile.id,
        servicePackage: {
          code: selectedPackage.code,
          label: selectedPackage.label,
          oilSpec: selectedPackage.oilSpec,
          oilCapacityQuarts: selectedPackage.oilCapacityQuarts,
          baseLaborServicePackage: selectedPackage.baseLaborServicePackage,
          checklist: selectedPackage.checklist,
          estimatedDurationMinutes: selectedPackage.estimatedDurationMinutes,
        },
        serviceType: selectedProfile.service_class,
        description: `${selectedPackage.label} for ${selectedVehicle.year || ""} ${selectedVehicle.make || ""} ${selectedVehicle.model || ""}`.trim(),
        priority,
        scheduledDate,
        scheduledTime,
        poNumber: poNumber || null,
        notes: notes || null,
        serviceDefaults: {
          oilSpec: selectedPackage.oilSpec,
          oilCapacityQuarts: selectedPackage.oilCapacityQuarts,
          recommendedServiceType: selectedProfile.service_class,
          baseLaborServicePackage: selectedPackage.baseLaborServicePackage,
          source: serviceDefaults.source,
        },
      });

      toast.success(`Work order ${result.orderNumber || ""} created`.trim());
      navigate(`/fleet-os/work-orders/${result.id}`);
    } catch (err) {
      console.error("[FleetWorkOrderCreatePage] Failed to create controlled work order", err);
      toast.error(err instanceof Error ? err.message : "Failed to create work order");
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex: Record<WizardStep, number> = { asset: 1, service: 2, schedule: 3, review: 4 };

  return (
    <FleetOSLayout title="New Work Order">
      <div className="max-w-4xl space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/fleet-os/work-orders")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold">Controlled Work Order Creation</h2>
          <Badge variant="outline">Step {stepIndex[step]} of 4</Badge>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Car className="h-4 w-4 text-blue-500" /> 1) Client + Vehicle Context</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                  <div>
                    <Label>Fleet Client *</Label>
                    <Select value={clientId} onValueChange={handleClientSelect}>
                      <SelectTrigger><SelectValue placeholder="Select fleet client first" /></SelectTrigger>
                      <SelectContent>
                        {(options?.clients || []).map((client) => (
                          <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="outline" onClick={() => setShowAddVehicleDialog(true)} disabled={!clientId}>
                    <Plus className="h-4 w-4 mr-1" /> Add Vehicle
                  </Button>
                </div>
                <div>
                  <Label>Vehicle *</Label>
                  <Select value={vehicleId} onValueChange={(value) => handleVehicleSelect(value)} disabled={!clientId}>
                    <SelectTrigger><SelectValue placeholder={clientId ? "Select client vehicle" : "Select a client first"} /></SelectTrigger>
                    <SelectContent>
                      {eligibleVehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model} {v.unit_number ? `(#${v.unit_number})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {clientId && eligibleVehicles.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      This client does not have any active vehicles yet. Use Add Vehicle to create one without leaving the work order.
                    </p>
                  )}
                </div>
                {selectedVehicle && (
                  <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-1">
                    <p><strong>VIN:</strong> {selectedVehicle.vin || "—"}</p>
                    <p><strong>Fleet:</strong> {selectedVehicle.fleet_client_id}</p>
                    <p><strong>Contract:</strong> {selectedVehicle.fleet_contract_id}</p>
                    <p><strong>Location:</strong> {selectedVehicle.fleet_location_id}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4 text-amber-500" /> 2) Structured Service Package</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Service Profile *</Label>
                    <Select value={serviceProfileId} onValueChange={(v) => { setServiceProfileId(v); setPackageCode(""); if (v) setStep("service"); }} disabled={!selectedVehicle}>
                      <SelectTrigger><SelectValue placeholder="Select service profile" /></SelectTrigger>
                      <SelectContent>
                        {serviceProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.service_class}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Service Package *</Label>
                    <Select value={packageCode} onValueChange={(v) => { setPackageCode(v); if (v) setStep("schedule"); }} disabled={!selectedProfile}>
                      <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                      <SelectContent>
                        {packageOptions.map((pkg) => <SelectItem key={pkg.code} value={pkg.code}>{pkg.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {selectedPackage && (
                  <div className="rounded-md border p-3 text-xs space-y-1">
                    <p><strong>Oil spec:</strong> {selectedPackage.oilSpec || "—"}</p>
                    <p><strong>Oil capacity:</strong> {selectedPackage.oilCapacityQuarts || "—"} qt</p>
                    <p><strong>Labor package:</strong> {selectedPackage.baseLaborServicePackage || "—"}</p>
                    <p><strong>Checklist:</strong> {selectedPackage.checklist.join(" • ")}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4 text-violet-500" /> 3) SLA-Aware Scheduling</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <Label>Date *</Label>
                    <Input type="date" value={scheduledDate} onChange={(e) => { setScheduledDate(e.target.value); setStep("schedule"); }} disabled={!selectedPackage} />
                  </div>
                  <div>
                    <Label>Valid Time Slot *</Label>
                    <Select value={scheduledTime} onValueChange={(v) => { setScheduledTime(v); if (v) setStep("review"); }} disabled={!scheduledDate || availableSlots.length === 0}>
                      <SelectTrigger><SelectValue placeholder={scheduledDate ? "Select available slot" : "Choose date first"} /></SelectTrigger>
                      <SelectContent>
                        {availableSlots.map((slot) => <SelectItem key={slot.time} value={slot.time}>{slot.time}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={priority} onValueChange={setPriority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {selectedContract && <p className="text-xs text-muted-foreground">Contract SLA window: {selectedContract.sla_hours ?? "—"}h. Location hours: {selectedLocation?.service_window_start || "08:00"} - {selectedLocation?.service_window_end || "17:00"}.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-indigo-500" /> 4) PO Validation + Final Review</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Purchase Order {poRequired ? "*" : "(optional)"}</Label>
                  <Select value={poNumber} onValueChange={setPoNumber}>
                    <SelectTrigger><SelectValue placeholder={poRequired ? "PO required by contract" : "Attach PO if needed"} /></SelectTrigger>
                    <SelectContent>
                      {validPOs.map((po) => (
                        <SelectItem key={po.id} value={String(po.po_number)}>
                          {po.po_number} — ${(Number(po.amount_limit || 0) - Number(po.amount_authorized || 0)).toFixed(2)} remaining
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Internal Notes</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional operational notes" />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3 pb-8">
              <Button variant="outline" onClick={() => navigate("/fleet-os/work-orders")}>Cancel</Button>
              <Button onClick={submit} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                <Send className="h-4 w-4 mr-1" /> Submit Controlled Work Order
              </Button>
            </div>
          </>
        )}
      </div>
      <AddVehicleDialog
        open={showAddVehicleDialog}
        onClose={() => setShowAddVehicleDialog(false)}
        onCreated={handleVehicleCreated}
        clientId={clientId}
      />
    </FleetOSLayout>
  );
};

export default FleetWorkOrderCreatePage;
