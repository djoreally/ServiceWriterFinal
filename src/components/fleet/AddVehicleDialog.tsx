import { useState, useEffect, useMemo } from "react";
import { VehicleYMMSelector } from "@/components/vehicles/VehicleYMMSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { Car, Check, ChevronsUpDown, MapPin, ScanLine } from "lucide-react";
import { fetchFleetVehicleFormOptions, type FleetVehicleFormOptions } from "@/application/queries";
import { createFleetVehicle, updateFleetVehicle, decodeVinNumber, type CreateFleetVehiclePayload } from "@/application/commands";
import { logAudit } from "@/lib/security/audit";
import { isValidVinFormat, normalizeVin } from "@/features/vehicle-import/nhtsa.service";

type FleetVehicleFormClient = FleetVehicleFormOptions["clients"][number];
type FleetVehicleFormLocation = FleetVehicleFormOptions["locations"][number];
type FleetVehicleFormContract = FleetVehicleFormOptions["contracts"][number];

type EditableFleetVehicle = Partial<CreateFleetVehiclePayload> & {
  id: string;
  year?: number | null;
  mileage?: number | null;
  last_service_mileage?: number | null;
  next_service_mileage?: number | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (vehicleId?: string) => void;
  clientId?: string;
  editingVehicle?: EditableFleetVehicle | null;
}

const NONE = "__none__";

/**
 * Fast, single-form vehicle intake. Only client + Year/Make/Model are required.
 * VIN, location, contract, unit#, plate, mileage are all optional and can be
 * filled in later from the vehicle profile.
 */
export const AddVehicleDialog = ({ open, onClose, onCreated, clientId, editingVehicle }: Props) => {
  const [saving, setSaving] = useState(false);
  const [decodingVin, setDecodingVin] = useState(false);
  const [clients, setClients] = useState<FleetVehicleFormClient[]>([]);
  const [locations, setLocations] = useState<FleetVehicleFormLocation[]>([]);
  const [contracts, setContracts] = useState<FleetVehicleFormContract[]>([]);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);

  const [form, setForm] = useState({
    fleet_client_id: clientId || "",
    fleet_location_id: "",
    fleet_contract_id: "",
    year: "",
    make: "",
    model: "",
    unit_number: "",
    vin: "",
    license_plate: "",
    mileage: "",
    status: "active",
    notes: "",
    engine: "",
    color: "",
    fuel_type: "",
    last_service_date: "",
    last_service_mileage: "",
    next_service_date: "",
    next_service_mileage: "",
  });

  useEffect(() => {
    if (editingVehicle) {
      setForm({
        fleet_client_id: editingVehicle.fleet_client_id || clientId || "",
        fleet_location_id: editingVehicle.fleet_location_id || "",
        fleet_contract_id: editingVehicle.fleet_contract_id || "",
        year: String(editingVehicle.year || ""),
        make: editingVehicle.make || "",
        model: editingVehicle.model || "",
        unit_number: editingVehicle.unit_number || "",
        vin: editingVehicle.vin || "",
        license_plate: editingVehicle.license_plate || "",
        mileage: String(editingVehicle.mileage || ""),
        status: editingVehicle.status || "active",
        notes: editingVehicle.notes || "",
        engine: editingVehicle.engine || "",
        color: editingVehicle.color || "",
        fuel_type: editingVehicle.fuel_type || "",
        last_service_date: editingVehicle.last_service_date || "",
        last_service_mileage: editingVehicle.last_service_mileage ? String(editingVehicle.last_service_mileage) : "",
        next_service_date: editingVehicle.next_service_date || "",
        next_service_mileage: editingVehicle.next_service_mileage ? String(editingVehicle.next_service_mileage) : "",
      });
    } else {
      setForm({
        fleet_client_id: clientId || "",
        fleet_location_id: "",
        fleet_contract_id: "",
        year: "",
        make: "",
        model: "",
        unit_number: "",
        vin: "",
        license_plate: "",
        mileage: "",
        status: "active",
        notes: "",
        engine: "",
        color: "",
        fuel_type: "",
        last_service_date: "",
        last_service_mileage: "",
        next_service_date: "",
        next_service_mileage: "",
      });
    }
  }, [editingVehicle, clientId, open]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        const { clients, locations, contracts } = await fetchFleetVehicleFormOptions();
        setClients(clients);
        setLocations(locations);
        setContracts(contracts);
      } catch (err) {
        console.error("[AddVehicleDialog] Failed to load options", err);
      }
    };
    void load();
  }, [open]);

  const filteredLocations = useMemo(
    () => (form.fleet_client_id ? locations.filter((location) => !location.fleet_client_id || location.fleet_client_id === form.fleet_client_id) : locations),
    [locations, form.fleet_client_id]
  );
  const filteredContracts = useMemo(
    () => (form.fleet_client_id ? contracts.filter((contract) => !contract.fleet_client_id || contract.fleet_client_id === form.fleet_client_id) : contracts),
    [contracts, form.fleet_client_id]
  );

  const selectedClient = clients.find((client) => client.id === form.fleet_client_id);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const selectClient = (fleetClientId: string) => {
    setForm((current) => {
      const locationStillApplies = locations.some(
        (location) => location.id === current.fleet_location_id && (!location.fleet_client_id || location.fleet_client_id === fleetClientId),
      );
      const contractStillApplies = contracts.some(
        (contract) => contract.id === current.fleet_contract_id && (!contract.fleet_client_id || contract.fleet_client_id === fleetClientId),
      );

      return {
        ...current,
        fleet_client_id: fleetClientId,
        fleet_location_id: locationStillApplies ? current.fleet_location_id : "",
        fleet_contract_id: contractStillApplies ? current.fleet_contract_id : "",
      };
    });
    setClientSearchOpen(false);
  };

  const decodeVin = async () => {
    const vin = normalizeVin(form.vin);
    if (!isValidVinFormat(vin)) {
      toast.error("VIN must be a valid 17-character VIN");
      return;
    }
    set("vin", vin);
    setDecodingVin(true);
    try {
      const decoded = await decodeVinNumber(vin);
      const decodedYear = typeof decoded.year === "number" && decoded.year > 1900 ? String(decoded.year) : "";
      const decodedMake = typeof decoded.make === "string" ? decoded.make.trim() : "";
      const decodedModel = typeof decoded.model === "string" ? decoded.model.trim() : "";
      // Engine is what makes the filter match engine-accurate for VIN-entered fleet units.
      const decodedEngine = typeof decoded.engine === "string" ? decoded.engine.trim() : "";

      setForm((prev) => ({
        ...prev,
        vin,
        year: decodedYear || prev.year,
        make: decodedMake || prev.make,
        model: decodedModel || prev.model,
        engine: decodedEngine || prev.engine,
      }));

      if (decodedYear && decodedMake && decodedModel) {
        toast.success("VIN decoded — Year/Make/Model populated");
      } else {
        toast.info("Partial VIN decode — fill in any missing fields manually");
      }
    } catch (error) {
      console.error("[AddVehicleDialog] VIN decode failed", error);
      toast.error("Failed to decode VIN — enter Year/Make/Model manually");
    } finally {
      setDecodingVin(false);
    }
  };

  const handleSave = async () => {
    let saveForm = form;
    const normalizedVin = form.vin ? normalizeVin(form.vin) : "";
    const previousVin = editingVehicle?.vin ? normalizeVin(editingVehicle.vin) : "";

    // A replacement VIN invalidates the old engine/fitment. Always decode again
    // before saving, even when the user did not press the Decode button.
    if (editingVehicle && normalizedVin && normalizedVin !== previousVin) {
      if (!isValidVinFormat(normalizedVin)) {
        toast.error("VIN must be a valid 17-character VIN");
        return;
      }
      setDecodingVin(true);
      try {
        const decoded = await decodeVinNumber(normalizedVin);
        saveForm = {
          ...form,
          vin: normalizedVin,
          year: typeof decoded.year === "number" && decoded.year > 1900 ? String(decoded.year) : form.year,
          make: typeof decoded.make === "string" && decoded.make.trim() ? decoded.make.trim() : form.make,
          model: typeof decoded.model === "string" && decoded.model.trim() ? decoded.model.trim() : form.model,
          engine: typeof decoded.engine === "string" ? decoded.engine.trim() : "",
        };
        setForm(saveForm);
      } catch (error) {
        console.error("[AddVehicleDialog] Replacement VIN decode failed", error);
        toast.error("The replacement VIN could not be decoded. Verify it before saving.");
        return;
      } finally {
        setDecodingVin(false);
      }
    }

    if (!saveForm.fleet_client_id) {
      toast.error("Select a fleet client");
      return;
    }
    if (!saveForm.year || !saveForm.make || !saveForm.model) {
      toast.error("Year, Make, and Model are required");
      return;
    }
    const year = parseInt(saveForm.year, 10);
    if (Number.isNaN(year)) {
      toast.error("Year must be a number");
      return;
    }
    if (saveForm.vin && saveForm.vin.trim().length > 0 && !isValidVinFormat(normalizeVin(saveForm.vin))) {
      toast.error("VIN must be 17 characters when provided");
      return;
    }
    const mileage = saveForm.mileage ? parseInt(saveForm.mileage, 10) : undefined;
    if (saveForm.mileage && Number.isNaN(mileage)) {
      toast.error("Mileage must be a number");
      return;
    }

    const payload: CreateFleetVehiclePayload = {
      fleet_client_id: saveForm.fleet_client_id,
      fleet_location_id: saveForm.fleet_location_id || null,
      fleet_contract_id: saveForm.fleet_contract_id || null,
      year,
      make: saveForm.make,
      model: saveForm.model,
      unit_number: saveForm.unit_number || null,
      vin: saveForm.vin ? saveForm.vin.trim().toUpperCase() : null,
      license_plate: saveForm.license_plate || null,
      mileage: mileage ?? null,
      status: saveForm.status,
      notes: saveForm.notes || null,
      engine: saveForm.engine || null,
      color: saveForm.color || null,
      fuel_type: saveForm.fuel_type || null,
      last_service_date: saveForm.last_service_date || null,
      last_service_mileage: saveForm.last_service_mileage ? parseInt(saveForm.last_service_mileage, 10) : null,
      next_service_date: saveForm.next_service_date || null,
      next_service_mileage: saveForm.next_service_mileage ? parseInt(saveForm.next_service_mileage, 10) : null,
    };

    setSaving(true);
    try {
      if (editingVehicle) {
        await updateFleetVehicle(editingVehicle.id, payload);
        toast.success("Vehicle updated");
      } else {
        const { id, warnings } = await createFleetVehicle(payload);
        toast.success("Vehicle added");
        warnings.forEach((w) => toast.warning(w));
        onCreated(id);
      }


      await logAudit({
        action: editingVehicle ? "vehicle.updated" : "vehicle.created",
        status: "success",
        details: { vin: payload.vin, fleet_client_id: payload.fleet_client_id },
        resource_type: "fleet_vehicles",
        resource_id: editingVehicle?.id,
      });

      if (editingVehicle) onCreated(editingVehicle.id);
      onClose();
    } catch (err) {
      console.error("[AddVehicleDialog] Failed to save vehicle", err);
      toast.error("Failed to save vehicle");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-4 w-4" /> {editingVehicle ? "Edit Vehicle" : "Add Vehicle"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Client (required) */}
          {!clientId && (
            <div className="space-y-2">
              <Label>Fleet Client *</Label>
              <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" role="combobox" aria-expanded={clientSearchOpen} className="w-full justify-between font-normal">
                    {selectedClient?.company_name || "Search existing fleet clients"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search clients..." />
                    <CommandList>
                      <CommandEmpty>No existing clients found.</CommandEmpty>
                      <CommandGroup>
                        {clients.map((client) => (
                          <CommandItem key={client.id} value={client.company_name} onSelect={() => selectClient(client.id)}>
                            <Check className={`mr-2 h-4 w-4 ${form.fleet_client_id === client.id ? "opacity-100" : "opacity-0"}`} />
                            {client.company_name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Location</Label>
              <Select value={form.fleet_location_id || NONE} onValueChange={(v) => set("fleet_location_id", v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Assign a location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No location assigned</SelectItem>
                  {filteredLocations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}{location.city ? ` — ${location.city}` : ""}{location.state ? `, ${location.state}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Locations are filtered to the selected client when available.</p>
            </div>
            <div className="space-y-2">
              <Label>Contract</Label>
              <Select value={form.fleet_contract_id || NONE} onValueChange={(v) => set("fleet_contract_id", v === NONE ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Assign a contract" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No contract assigned</SelectItem>
                  {filteredContracts.map((contract) => <SelectItem key={contract.id} value={contract.id}>{contract.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* VIN — optional but smart */}
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label>VIN <span className="text-xs text-muted-foreground font-normal">(optional — auto-fills Year/Make/Model)</span></Label>
              <Input
                placeholder="17-character VIN"
                value={form.vin}
                maxLength={17}
                className="font-mono uppercase"
                onChange={(e) => set("vin", e.target.value.toUpperCase())}
              />
            </div>
            <Button type="button" variant="outline" onClick={decodeVin} disabled={decodingVin || !form.vin}>
              <ScanLine className="h-4 w-4 mr-1" /> {decodingVin ? "Decoding…" : "Decode"}
            </Button>
          </div>

          {/* Year / Make / Model — required, catalog-driven */}
          <VehicleYMMSelector
            required
            value={{ year: form.year, make: form.make, model: form.model }}
            onChange={(v) => setForm((prev) => ({ ...prev, year: v.year, make: v.make, model: v.model }))}
          />

          {/* Identifiers */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Unit #</Label>
              <Input placeholder="U-001" value={form.unit_number} onChange={(e) => set("unit_number", e.target.value)} />
            </div>
            <div>
              <Label>License Plate</Label>
              <Input placeholder="ABC-1234" value={form.license_plate} onChange={(e) => set("license_plate", e.target.value)} />
            </div>
            <div>
              <Label>Mileage</Label>
              <Input placeholder="45000" type="number" value={form.mileage} onChange={(e) => set("mileage", e.target.value)} />
            </div>
          </div>

          {/* Vehicle specs & service history */}
          <details className="rounded-lg border border-border" open={!!editingVehicle}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              Specs & service history
            </summary>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 pt-1">
              <div>
                <Label>Engine</Label>
                <Input placeholder="2.5L I4" value={form.engine} onChange={(e) => set("engine", e.target.value)} />
              </div>
              <div>
                <Label>Color</Label>
                <Input placeholder="White" value={form.color} onChange={(e) => set("color", e.target.value)} />
              </div>
              <div>
                <Label>Fuel Type</Label>
                <Select value={form.fuel_type || NONE} onValueChange={(v) => set("fuel_type", v === NONE ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    <SelectItem value="gasoline">Gasoline</SelectItem>
                    <SelectItem value="diesel">Diesel</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="electric">Electric</SelectItem>
                    <SelectItem value="cng">CNG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Last Service Date</Label>
                <Input type="date" value={form.last_service_date} onChange={(e) => set("last_service_date", e.target.value)} />
              </div>
              <div>
                <Label>Last Service Mileage</Label>
                <Input type="number" placeholder="42000" value={form.last_service_mileage} onChange={(e) => set("last_service_mileage", e.target.value)} />
              </div>
              <div />
              <div>
                <Label>Next Service Date</Label>
                <Input type="date" value={form.next_service_date} onChange={(e) => set("next_service_date", e.target.value)} />
              </div>
              <div>
                <Label>Next Service Mileage</Label>
                <Input type="number" placeholder="47000" value={form.next_service_mileage} onChange={(e) => set("next_service_mileage", e.target.value)} />
              </div>
            </div>
          </details>


          {/* Status + notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="maintenance">In Maintenance</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              placeholder="Optional notes about this vehicle"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : editingVehicle ? "Update Vehicle" : "Add Vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
