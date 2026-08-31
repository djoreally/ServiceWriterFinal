import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fetchFleetClientsForContract, createFleetContract, updateFleetContract, type FleetContractRulePayload } from "@/application/commands/fleet-contract.command";
import { useAuth } from "@packages/auth";
import { toast } from "@/components/ui/sonner";
import { FileText, ShieldCheck, Receipt, CalendarClock, ClipboardList, Package } from "lucide-react";
import { ContractServicesStep } from "./ContractServicesStep";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  clientId?: string;
  editingContract?: EditingContract;
}

type FleetClientOption = Awaited<ReturnType<typeof fetchFleetClientsForContract>>[number];

interface EditingContract {
  id: string;
  fleet_client_id?: string | null;
  name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  sla_hours?: number | null;
  approval_threshold?: number | null;
  invoice_frequency?: string | null;
  is_active?: boolean | null;
  pricing_rules?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nestedRecord = (value: unknown, key: string): Record<string, unknown> => {
  if (!isRecord(value)) return {};
  const nested = value[key];
  return isRecord(nested) ? nested : {};
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

type Step = "core" | "approval" | "billing" | "scope" | "services" | "activation";

const SERVICE_CLASSES = ["Class A PM", "Class B PM", "Brake Service", "Diagnostics", "Emergency Roadside", "Inspection"];

export const AddContractDialog = ({ open, onClose, onCreated, clientId, editingContract }: Props) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<FleetClientOption[]>([]);
  const [step, setStep] = useState<Step>("core");
  const [savedContractId, setSavedContractId] = useState<string | null>(editingContract?.id || null);

  const [form, setForm] = useState({
    fleet_client_id: clientId || "",
    name: "",
    start_date: "",
    end_date: "",
    sla_hours: "24",
    approval_mode: "hybrid",
    approval_threshold: "500",
    approver_role: "fleet_manager",
    require_photo_evidence: false,
    billing_model: "flat_rate",
    invoice_frequency: "monthly",
    net_terms: "net_30",
    invoice_group: "",
    po_required: false,
    po_validate_remaining: true,
    service_scope: [] as string[],
    restrict_to_profiled_services: true,
    enforce_location_windows: true,
    enforce_sla_window: true,
    min_dispatch_buffer_minutes: "15",
    change_summary: "",
    is_active: true,
  });

  useEffect(() => {
    if (editingContract) {
      void Promise.resolve().then(() => setSavedContractId(editingContract.id));
      const rules = isRecord(editingContract.pricing_rules) ? editingContract.pricing_rules : {};
      const approval = nestedRecord(rules, "approval");
      const billing = nestedRecord(rules, "billing");
      const po = nestedRecord(rules, "po");
      const serviceScope = nestedRecord(rules, "service_scope");
      const scheduling = nestedRecord(rules, "scheduling");
      const allowedServiceClasses = serviceScope.allowed_service_classes;
      void Promise.resolve().then(() => setForm({
        fleet_client_id: editingContract.fleet_client_id || clientId || "",
        name: editingContract.name || "",
        start_date: editingContract.start_date || "",
        end_date: editingContract.end_date || "",
        sla_hours: String(editingContract.sla_hours || numberValue(rules.sla_hours) || 24),
        approval_mode: stringValue(approval.mode) || "hybrid",
        approval_threshold: String(editingContract.approval_threshold || numberValue(approval.threshold_amount) || 500),
        approver_role: stringValue(approval.approver_role) || "fleet_manager",
        require_photo_evidence: Boolean(approval.require_photo_evidence),
        billing_model: stringValue(billing.model) || "flat_rate",
        invoice_frequency: editingContract.invoice_frequency || stringValue(billing.invoice_frequency) || "monthly",
        net_terms: stringValue(billing.net_terms) || "net_30",
        invoice_group: stringValue(billing.invoice_group) || "",
        po_required: Boolean(po.requires_po),
        po_validate_remaining: po.validate_remaining_balance !== false,
        service_scope: Array.isArray(allowedServiceClasses) ? allowedServiceClasses.filter((value): value is string => typeof value === "string") : [],
        restrict_to_profiled_services: serviceScope.restrict_to_profiled_services !== false,
        enforce_location_windows: scheduling.enforce_location_windows !== false,
        enforce_sla_window: scheduling.enforce_sla_window !== false,
        min_dispatch_buffer_minutes: String(numberValue(scheduling.min_dispatch_buffer_minutes) || 15),
        change_summary: "",
        is_active: !!editingContract.is_active,
      }));
    } else {
      void Promise.resolve().then(() => setSavedContractId(null));
      void Promise.resolve().then(() => setForm((prev) => ({ ...prev, fleet_client_id: clientId || "" })));
    }
    void Promise.resolve().then(() => setStep("core"));
  }, [editingContract, clientId, open]);

  useEffect(() => {
    if (!user?.id || !open) return;
    fetchFleetClientsForContract(user.id).then(setClients);
  }, [user?.id, open]);

  const set = (k: string, v: string | boolean | string[]) => setForm((f) => ({ ...f, [k]: v }));

  const toggleServiceScope = (serviceClass: string) => {
    set("service_scope", form.service_scope.includes(serviceClass)
      ? form.service_scope.filter((v) => v !== serviceClass)
      : [...form.service_scope, serviceClass]
    );
  };

  const validate = () => {
    if (!user?.id) return "Unauthorized";
    if (!form.fleet_client_id || !form.name) return "Client and contract name are required.";
    if (!form.start_date || !form.end_date) return "Contract term dates are required.";
    if (form.start_date > form.end_date) return "Contract end date must be after start date.";
    if (!form.invoice_group) return "Billing invoice group is required.";
    if (form.service_scope.length === 0) return "At least one service class must be selected.";
    if (form.is_active && Number.parseFloat(form.sla_hours) <= 0) return "Active contracts require valid SLA hours.";
    if (form.is_active && form.approval_mode === "hybrid" && Number.parseFloat(form.approval_threshold) <= 0) return "Hybrid approval mode requires threshold > 0.";
    if (form.is_active && form.po_required && !form.po_validate_remaining) return "PO-required contracts must validate remaining PO balance.";
    return null;
  };

  const handleSave = async () => {
    const errorMessage = validate();
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    if (!user?.id) return;

    const payload: FleetContractRulePayload = {
      fleet_client_id: form.fleet_client_id,
      name: form.name,
      start_date: form.start_date,
      end_date: form.end_date,
      is_active: form.is_active,
      change_summary: form.change_summary,
      rule_engine: {
        sla_hours: Number.parseInt(form.sla_hours, 10),
        approval: {
          mode: form.approval_mode as FleetContractRulePayload["rule_engine"]["approval"]["mode"],
          threshold_amount: Number.parseFloat(form.approval_threshold),
          approver_role: form.approver_role as FleetContractRulePayload["rule_engine"]["approval"]["approver_role"],
          require_photo_evidence: form.require_photo_evidence,
        },
        billing: {
          model: form.billing_model as FleetContractRulePayload["rule_engine"]["billing"]["model"],
          invoice_frequency: form.invoice_frequency as FleetContractRulePayload["rule_engine"]["billing"]["invoice_frequency"],
          net_terms: form.net_terms as FleetContractRulePayload["rule_engine"]["billing"]["net_terms"],
          invoice_group: form.invoice_group,
        },
        po: {
          requires_po: form.po_required,
          validate_remaining_balance: form.po_validate_remaining,
        },
        service_scope: {
          allowed_service_classes: form.service_scope,
          restrict_to_profiled_services: form.restrict_to_profiled_services,
        },
        scheduling: {
          enforce_location_windows: form.enforce_location_windows,
          enforce_sla_window: form.enforce_sla_window,
          min_dispatch_buffer_minutes: Number.parseInt(form.min_dispatch_buffer_minutes, 10) as FleetContractRulePayload["rule_engine"]["scheduling"]["min_dispatch_buffer_minutes"],
        },
      },
    };

    setSaving(true);
    try {
      if (editingContract) {
        await updateFleetContract(editingContract.id, payload);
        toast.success("Contract rule set updated");
      } else {
        const newId = await createFleetContract(user.id, payload);
        if (newId) setSavedContractId(newId);
        toast.success("Contract rule set created");
      }
      onCreated();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save contract");
    } finally {
      setSaving(false);
    }
  };

  const stepLabels: Record<Step, string> = {
    core: "1. core",
    approval: "2. approval",
    billing: "3. billing",
    scope: "4. scope",
    services: "5. services",
    activation: "6. activation",
  };

  const stepOrder: Step[] = ["core", "approval", "billing", "scope", "services", "activation"];
  const stepIdx = stepOrder.indexOf(step);
  const prevStep = stepIdx > 0 ? stepOrder[stepIdx - 1] : null;
  const nextStep = stepIdx < stepOrder.length - 1 ? stepOrder[stepIdx + 1] : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-600" /> {editingContract ? "Edit Contract Rule Engine" : "New Contract Rule Engine"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-6 gap-1.5 text-xs">
          {stepOrder.map((s) => (
            <div key={s} className={`rounded border p-1.5 text-center ${step === s ? "border-indigo-500 bg-indigo-500/10" : ""}`}>
              {stepLabels[s]}
            </div>
          ))}
        </div>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {step === "core" && (
            <div className="space-y-3">
              {!clientId && (
                <div>
                  <Label>Client *</Label>
                  <Select value={form.fleet_client_id} onValueChange={(v) => set("fleet_client_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Contract Name *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="2026 Fleet Service Program" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Start Date *</Label><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></div>
                <div><Label>End Date *</Label><Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></div>
              </div>
              <div><Label>SLA Hours *</Label><Input type="number" value={form.sla_hours} onChange={(e) => set("sla_hours", e.target.value)} /></div>
            </div>
          )}

          {step === "approval" && (
            <div className="space-y-3">
              <div><Label>Approval Mode</Label><Select value={form.approval_mode} onValueChange={(v) => set("approval_mode", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="auto">Auto</SelectItem><SelectItem value="manual">Manual</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Approval Threshold ($)</Label><Input type="number" value={form.approval_threshold} onChange={(e) => set("approval_threshold", e.target.value)} /></div>
                <div><Label>Approver Role</Label><Select value={form.approver_role} onValueChange={(v) => set("approver_role", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fleet_manager">Fleet Manager</SelectItem><SelectItem value="ops_manager">Ops Manager</SelectItem><SelectItem value="finance">Finance</SelectItem></SelectContent></Select></div>
              </div>
              <div className="flex items-center justify-between rounded border p-3"><div className="flex items-center gap-1"><ShieldCheck className="h-4 w-4" /> Require photo evidence for approvals</div><Switch checked={form.require_photo_evidence} onCheckedChange={(v) => set("require_photo_evidence", v)} /></div>
            </div>
          )}

          {step === "billing" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Billing Model</Label><Select value={form.billing_model} onValueChange={(v) => set("billing_model", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="per_service">Per Service</SelectItem><SelectItem value="flat_rate">Flat Rate</SelectItem><SelectItem value="time_and_materials">Time & Materials</SelectItem><SelectItem value="blended">Blended</SelectItem></SelectContent></Select></div>
                <div><Label>Invoice Frequency</Label><Select value={form.invoice_frequency} onValueChange={(v) => set("invoice_frequency", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="per_service">Per Service</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="biweekly">Bi-Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Payment Terms</Label><Select value={form.net_terms} onValueChange={(v) => set("net_terms", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="due_on_receipt">Due on Receipt</SelectItem><SelectItem value="net_15">Net 15</SelectItem><SelectItem value="net_30">Net 30</SelectItem><SelectItem value="net_45">Net 45</SelectItem><SelectItem value="net_60">Net 60</SelectItem></SelectContent></Select></div>
                <div><Label>Invoice Group *</Label><Input value={form.invoice_group} onChange={(e) => set("invoice_group", e.target.value)} placeholder="Regional Ops" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded border p-3"><div className="flex items-center gap-1"><Receipt className="h-4 w-4" /> PO required</div><Switch checked={form.po_required} onCheckedChange={(v) => set("po_required", v)} /></div>
                <div className="flex items-center justify-between rounded border p-3"><div className="flex items-center gap-1"><Receipt className="h-4 w-4" /> Validate PO remaining balance</div><Switch checked={form.po_validate_remaining} onCheckedChange={(v) => set("po_validate_remaining", v)} /></div>
              </div>
            </div>
          )}

          {step === "scope" && (
            <div className="space-y-3">
              <Label>Service Scope *</Label>
              <div className="grid grid-cols-2 gap-2">
                {SERVICE_CLASSES.map((serviceClass) => (
                  <Button key={serviceClass} type="button" variant={form.service_scope.includes(serviceClass) ? "default" : "outline"} onClick={() => toggleServiceScope(serviceClass)}>
                    <ClipboardList className="h-3 w-3 mr-1" /> {serviceClass}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded border p-3"><span className="text-sm">Restrict to profiled services</span><Switch checked={form.restrict_to_profiled_services} onCheckedChange={(v) => set("restrict_to_profiled_services", v)} /></div>
                <div className="flex items-center justify-between rounded border p-3"><span className="text-sm">Enforce location windows</span><Switch checked={form.enforce_location_windows} onCheckedChange={(v) => set("enforce_location_windows", v)} /></div>
                <div className="flex items-center justify-between rounded border p-3"><span className="text-sm">Enforce SLA window</span><Switch checked={form.enforce_sla_window} onCheckedChange={(v) => set("enforce_sla_window", v)} /></div>
                <div><Label>Dispatch Buffer</Label><Select value={form.min_dispatch_buffer_minutes} onValueChange={(v) => set("min_dispatch_buffer_minutes", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">0 min</SelectItem><SelectItem value="15">15 min</SelectItem><SelectItem value="30">30 min</SelectItem><SelectItem value="45">45 min</SelectItem><SelectItem value="60">60 min</SelectItem></SelectContent></Select></div>
              </div>
            </div>
          )}

          {step === "services" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4 text-indigo-600" />
                <span className="font-medium text-sm">Contract Service Catalog</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Attach platform services to this contract with optional custom pricing. These services will be available when creating work orders for this client.
              </p>
              {savedContractId ? (
                <ContractServicesStep
                  contractId={savedContractId}
                  userId={user?.id || ""}
                />
              ) : (
                <p className="text-xs text-muted-foreground bg-muted p-3 rounded">
                  Save the contract first (in the Activation step), then come back here to attach services.
                </p>
              )}
            </div>
          )}

          {step === "activation" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded border p-3"><div className="flex items-center gap-1"><CalendarClock className="h-4 w-4" /> Activate this contract now</div><Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} /></div>
              <div>
                <Label>Change Summary (for version log)</Label>
                <Input value={form.change_summary} onChange={(e) => set("change_summary", e.target.value)} placeholder="Describe what changed in this revision" />
              </div>
              <p className="text-xs text-muted-foreground">Activation validates SLA, approval, PO, billing, and service-scope rules before allowing active state.</p>
            </div>
          )}
        </div>

        <DialogFooter className="justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {prevStep && <Button variant="outline" onClick={() => setStep(prevStep)}>Back</Button>}
          </div>
          {nextStep && step !== "activation" && (
            <Button onClick={() => setStep(nextStep)}>Continue</Button>
          )}
          {step === "activation" && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingContract ? "Update Contract Engine" : "Create Contract Engine"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
