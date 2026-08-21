import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fetchFleetLocationRegistrationOptions } from "@/application/queries/fleet-location.query";
import { insertFleetLocation, updateFleetLocation, type FleetLocationRegistrationPayload } from "@/application/commands/fleet-location.command";
import { useAuth } from "@packages/auth";
import { toast } from "sonner";
import { Building2, FileText, LockKeyhole, ReceiptText, CalendarClock } from "lucide-react";
import { logAudit } from "@/lib/security/audit";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  clientId?: string;
  editingLocation?: any;
}

type Step = "site" | "operations" | "access" | "billing";

export const AddLocationDialog = ({ open, onClose, onCreated, clientId, editingLocation }: Props) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>("site");
  const [clients, setClients] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);

  const [form, setForm] = useState({
    fleet_client_id: clientId || "",
    default_contract_id: "",
    name: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    site_contact_name: "",
    site_contact_phone: "",
    site_contact_role: "site_manager",
    service_window_start: "08:00",
    service_window_end: "17:00",
    slot_interval_minutes: "30",
    max_jobs_per_slot: "2",
    dispatch_buffer_minutes: "15",
    gate_access: "none",
    security_checkin_required: false,
    ppe_required: false,
    parking_type: "lot",
    access_instructions: "",
    invoice_group: "",
    cost_center: "",
    billing_mode: "contract",
    tax_region: "local",
    is_primary: false,
  });

  useEffect(() => {
    if (editingLocation) {
      const noteData = (() => {
        try {
          return editingLocation.notes ? JSON.parse(editingLocation.notes) : {};
        } catch {
          return {};
        }
      })();

      setForm({
        fleet_client_id: editingLocation.fleet_client_id || clientId || "",
        default_contract_id: noteData.default_contract_id || "",
        name: editingLocation.name || "",
        address: editingLocation.address || "",
        city: editingLocation.city || "",
        state: editingLocation.state || "",
        postal_code: editingLocation.postal_code || "",
        site_contact_name: editingLocation.site_contact_name || "",
        site_contact_phone: editingLocation.site_contact_phone || "",
        site_contact_role: noteData.site_contact_role || "site_manager",
        service_window_start: editingLocation.service_window_start || "08:00",
        service_window_end: editingLocation.service_window_end || "17:00",
        slot_interval_minutes: String(noteData.scheduling_policy?.slot_interval_minutes || 30),
        max_jobs_per_slot: String(noteData.scheduling_policy?.max_jobs_per_slot || 2),
        dispatch_buffer_minutes: String(noteData.scheduling_policy?.dispatch_buffer_minutes || 15),
        gate_access: noteData.access_profile?.gate_access || "none",
        security_checkin_required: Boolean(noteData.access_profile?.security_checkin_required),
        ppe_required: Boolean(noteData.access_profile?.ppe_required),
        parking_type: noteData.access_profile?.parking_type || "lot",
        access_instructions: editingLocation.access_instructions || "",
        invoice_group: noteData.billing_context?.invoice_group || "",
        cost_center: noteData.billing_context?.cost_center || "",
        billing_mode: noteData.billing_context?.billing_mode || "contract",
        tax_region: noteData.billing_context?.tax_region || "local",
        is_primary: !!editingLocation.is_primary,
      });
    } else {
      setForm((prev) => ({
        ...prev,
        fleet_client_id: clientId || "",
      }));
    }
    setStep("site");
  }, [editingLocation, clientId, open]);

  useEffect(() => {
    if (!user?.id || !open) return;
    const load = async () => {
      const result = await fetchFleetLocationRegistrationOptions(user.id);
      setClients(result.clients ?? []);
      setContracts(result.contracts ?? []);
    };
    void load();
  }, [user?.id, open]);

  const clientContracts = useMemo(
    () => contracts.filter((c) => c.fleet_client_id === form.fleet_client_id),
    [contracts, form.fleet_client_id]
  );

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    if (!user?.id) return "Unauthorized";
    if (!form.fleet_client_id) return "Fleet client is required.";
    if (!form.default_contract_id) return "Default contract is required.";
    if (!form.name || !form.address || !form.city || !form.state || !form.postal_code) return "Site identity fields are required.";
    if (!form.site_contact_name || !form.site_contact_phone) return "Site contact is required.";
    if (!form.service_window_start || !form.service_window_end) return "Service window start and end are required.";
    if (form.service_window_start >= form.service_window_end) return "Service window end must be after start.";
    if (!form.invoice_group || !form.cost_center) return "Billing context (invoice group and cost center) is required.";
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!user?.id) return;

    setSaving(true);

    const registrationPayload: FleetLocationRegistrationPayload = {
      user_id: user.id,
      fleet_client_id: form.fleet_client_id,
      default_contract_id: form.default_contract_id,
      name: form.name,
      address: form.address,
      city: form.city,
      state: form.state,
      postal_code: form.postal_code,
      site_contact_name: form.site_contact_name,
      site_contact_phone: form.site_contact_phone,
      site_contact_role: form.site_contact_role as FleetLocationRegistrationPayload["site_contact_role"],
      service_window_start: form.service_window_start,
      service_window_end: form.service_window_end,
      access_instructions: form.access_instructions || null,
      access_profile: {
        gate_access: form.gate_access as FleetLocationRegistrationPayload["access_profile"]["gate_access"],
        security_checkin_required: form.security_checkin_required,
        ppe_required: form.ppe_required,
        parking_type: form.parking_type as FleetLocationRegistrationPayload["access_profile"]["parking_type"],
      },
      scheduling_policy: {
        slot_interval_minutes: Number.parseInt(form.slot_interval_minutes, 10) as FleetLocationRegistrationPayload["scheduling_policy"]["slot_interval_minutes"],
        max_jobs_per_slot: Number.parseInt(form.max_jobs_per_slot, 10) as FleetLocationRegistrationPayload["scheduling_policy"]["max_jobs_per_slot"],
        dispatch_buffer_minutes: Number.parseInt(form.dispatch_buffer_minutes, 10) as FleetLocationRegistrationPayload["scheduling_policy"]["dispatch_buffer_minutes"],
      },
      billing_context: {
        invoice_group: form.invoice_group,
        cost_center: form.cost_center,
        billing_mode: form.billing_mode as FleetLocationRegistrationPayload["billing_context"]["billing_mode"],
        tax_region: form.tax_region as FleetLocationRegistrationPayload["billing_context"]["tax_region"],
      },
      is_primary: form.is_primary,
    };

    try {
      if (editingLocation) {
        await updateFleetLocation(editingLocation.id, {
          fleet_client_id: registrationPayload.fleet_client_id,
          name: registrationPayload.name,
          address: registrationPayload.address,
          city: registrationPayload.city,
          state: registrationPayload.state,
          postal_code: registrationPayload.postal_code,
          site_contact_name: registrationPayload.site_contact_name,
          site_contact_phone: registrationPayload.site_contact_phone,
          service_window_start: registrationPayload.service_window_start,
          service_window_end: registrationPayload.service_window_end,
          access_instructions: registrationPayload.access_instructions,
          is_primary: registrationPayload.is_primary,
          notes: JSON.stringify({
            registration_version: "service_site_v1",
            site_contact_role: registrationPayload.site_contact_role,
            default_contract_id: registrationPayload.default_contract_id,
            access_profile: registrationPayload.access_profile,
            scheduling_policy: registrationPayload.scheduling_policy,
            billing_context: registrationPayload.billing_context,
          }),
        });
        toast.success("Service site updated");
      } else {
        await insertFleetLocation(registrationPayload);
        toast.success("Service site registered");
      }

      await logAudit({
        action: "settings.updated",
        status: "success",
        details: {
          target: "fleet_location",
          fleet_client_id: registrationPayload.fleet_client_id,
          default_contract_id: registrationPayload.default_contract_id,
          scheduling_policy: registrationPayload.scheduling_policy,
          billing_context: registrationPayload.billing_context,
        },
        resource_type: "fleet_locations",
        resource_id: editingLocation?.id,
      });

      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save location");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" /> {editingLocation ? "Edit Service Site Registration" : "Register Service Site"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className={`rounded border p-2 ${step === "site" ? "border-blue-500 bg-blue-500/10" : ""}`}>1. Site</div>
          <div className={`rounded border p-2 ${step === "operations" ? "border-blue-500 bg-blue-500/10" : ""}`}>2. Ops</div>
          <div className={`rounded border p-2 ${step === "access" ? "border-blue-500 bg-blue-500/10" : ""}`}>3. Access</div>
          <div className={`rounded border p-2 ${step === "billing" ? "border-blue-500 bg-blue-500/10" : ""}`}>4. Billing</div>
        </div>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {step === "site" && (
            <div className="space-y-3">
              {!clientId && (
                <div>
                  <Label>Fleet Client *</Label>
                  <Select value={form.fleet_client_id} onValueChange={(v) => { set("fleet_client_id", v); set("default_contract_id", ""); }}>
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Default Contract *</Label>
                <Select value={form.default_contract_id} onValueChange={(v) => set("default_contract_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
                  <SelectContent>{clientContracts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Site Name *</Label>
                  <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Dallas Service Hub" />
                </div>
                <div className="col-span-2">
                  <Label>Address *</Label>
                  <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Industrial Blvd" />
                </div>
                <div><Label>City *</Label><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
                <div><Label>State *</Label><Input maxLength={2} value={form.state} onChange={(e) => set("state", e.target.value.toUpperCase())} /></div>
                <div><Label>ZIP *</Label><Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} /></div>
              </div>
            </div>
          )}

          {step === "operations" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Service Window Start *</Label><Input type="time" value={form.service_window_start} onChange={(e) => set("service_window_start", e.target.value)} /></div>
                <div><Label>Service Window End *</Label><Input type="time" value={form.service_window_end} onChange={(e) => set("service_window_end", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Slot Interval</Label>
                  <Select value={form.slot_interval_minutes} onValueChange={(v) => set("slot_interval_minutes", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="15">15 min</SelectItem><SelectItem value="30">30 min</SelectItem><SelectItem value="60">60 min</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Max Jobs/Slot</Label>
                  <Select value={form.max_jobs_per_slot} onValueChange={(v) => set("max_jobs_per_slot", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem><SelectItem value="3">3</SelectItem><SelectItem value="4">4</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dispatch Buffer</Label>
                  <Select value={form.dispatch_buffer_minutes} onValueChange={(v) => set("dispatch_buffer_minutes", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="0">0 min</SelectItem><SelectItem value="15">15 min</SelectItem><SelectItem value="30">30 min</SelectItem><SelectItem value="45">45 min</SelectItem><SelectItem value="60">60 min</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Site Contact Name *</Label><Input value={form.site_contact_name} onChange={(e) => set("site_contact_name", e.target.value)} /></div>
                <div><Label>Site Contact Phone *</Label><Input value={form.site_contact_phone} onChange={(e) => set("site_contact_phone", e.target.value)} /></div>
              </div>
              <div>
                <Label>Contact Role</Label>
                <Select value={form.site_contact_role} onValueChange={(v) => set("site_contact_role", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="site_manager">Site Manager</SelectItem><SelectItem value="dispatch_coordinator">Dispatch Coordinator</SelectItem><SelectItem value="security">Security</SelectItem><SelectItem value="billing">Billing</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === "access" && (
            <div className="space-y-3">
              <div>
                <Label>Gate Access Mode</Label>
                <Select value={form.gate_access} onValueChange={(v) => set("gate_access", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="guarded_gate">Guarded Gate</SelectItem><SelectItem value="badge">Badge Required</SelectItem><SelectItem value="code">Code Entry</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Parking Type</Label>
                <Select value={form.parking_type} onValueChange={(v) => set("parking_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="street">Street</SelectItem><SelectItem value="lot">Lot</SelectItem><SelectItem value="loading_dock">Loading Dock</SelectItem><SelectItem value="reserved">Reserved</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded border p-3"><div><p className="text-sm">Security check-in required</p></div><Switch checked={form.security_checkin_required} onCheckedChange={(v) => set("security_checkin_required", v)} /></div>
                <div className="flex items-center justify-between rounded border p-3"><div><p className="text-sm">PPE required</p></div><Switch checked={form.ppe_required} onCheckedChange={(v) => set("ppe_required", v)} /></div>
              </div>
              <div>
                <Label>Access Instructions</Label>
                <Input value={form.access_instructions} onChange={(e) => set("access_instructions", e.target.value)} placeholder="Gate 3, check in with security desk" />
              </div>
            </div>
          )}

          {step === "billing" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Invoice Group *</Label><Input value={form.invoice_group} onChange={(e) => set("invoice_group", e.target.value)} placeholder="North Region" /></div>
                <div><Label>Cost Center *</Label><Input value={form.cost_center} onChange={(e) => set("cost_center", e.target.value)} placeholder="CC-102" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Billing Mode</Label>
                  <Select value={form.billing_mode} onValueChange={(v) => set("billing_mode", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="contract">Contract</SelectItem><SelectItem value="time_and_materials">Time & Materials</SelectItem><SelectItem value="blended">Blended</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tax Region</Label>
                  <Select value={form.tax_region} onValueChange={(v) => set("tax_region", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="local">Local</SelectItem><SelectItem value="state">State</SelectItem><SelectItem value="exempt">Exempt</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded border p-3">
                <div><p className="text-sm">Primary service site</p><p className="text-xs text-muted-foreground">Default dispatch destination for this client.</p></div>
                <Switch checked={form.is_primary} onCheckedChange={(v) => set("is_primary", v)} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div className="rounded border p-2 flex items-center gap-1"><FileText className="h-3 w-3" /> Contract-linked</div>
                <div className="rounded border p-2 flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Scheduling policy stored</div>
                <div className="rounded border p-2 flex items-center gap-1"><LockKeyhole className="h-3 w-3" /> Access policy stored</div>
                <div className="rounded border p-2 col-span-3 flex items-center gap-1"><ReceiptText className="h-3 w-3" /> Billing context stored for dispatch → execution → invoice workflow.</div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {step !== "site" && <Button variant="outline" onClick={() => setStep(step === "operations" ? "site" : step === "access" ? "operations" : "access")}>Back</Button>}
          </div>
          {step === "site" && <Button onClick={() => setStep("operations")}>Continue</Button>}
          {step === "operations" && <Button onClick={() => setStep("access")}>Continue</Button>}
          {step === "access" && <Button onClick={() => setStep("billing")}>Continue</Button>}
          {step === "billing" && <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editingLocation ? "Update Service Site" : "Register Service Site"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
