import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { createFleetClient, type FleetClientContactPayload } from "@/application/commands/fleet-client.command";
import { useAuth } from "@packages/auth";
import { toast } from "sonner";
import { Plus, Trash2, Building2, DollarSign, Shield } from "lucide-react";

// Smart defaults per role for contact permissions
const ROLE_DEFAULTS: Record<string, Partial<FleetClientContactPayload>> = {
  "Fleet Manager": { can_approve_work: true, receives_reports: true, view_vehicles: true, view_service_history: true, manage_vehicles: true, download_reports: true },
  "Billing Department": { receives_invoices: true, approve_quotes: false },
  "Admin": { can_approve_work: true, receives_invoices: true, receives_reports: true, view_vehicles: true, view_service_history: true, request_service: true, manage_vehicles: true, download_reports: true, approve_quotes: true },
  "AP Contact": { receives_invoices: true },
  "Regional Ops Manager": { receives_reports: true, view_vehicles: true, view_service_history: true, download_reports: true },
  "Site Supervisor": { view_vehicles: true, view_service_history: true },
};

interface ContactInput {
  name: string;
  role: string;
  email: string;
  phone: string;
  can_approve_work: boolean;
  receives_invoices: boolean;
  receives_reports: boolean;
  is_primary: boolean;
  view_vehicles: boolean;
  view_service_history: boolean;
  request_service: boolean;
  manage_vehicles: boolean;
  download_reports: boolean;
  approve_quotes: boolean;
  communication_preference: string;
}

const defaultContact = (overrides?: Partial<ContactInput>): ContactInput => ({
  name: "", role: "", email: "", phone: "",
  can_approve_work: false, receives_invoices: false, receives_reports: false, is_primary: false,
  view_vehicles: false, view_service_history: false, request_service: false,
  manage_vehicles: false, download_reports: false, approve_quotes: false,
  communication_preference: "email",
  ...overrides,
});

const FleetClientNew = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    billing_email: "",
    ap_contact_name: "",
    ap_contact_email: "",
    ap_contact_phone: "",
    phone: "",
    address: "",
    address_line_2: "",
    city: "",
    state: "",
    postal_code: "",
    payment_terms: "net_30",
    portal_access_enabled: false,
    notes: "",
    credit_status: "active",
    default_pricing_tier: "retail",
    tax_exempt: false,
    internal_notes: "",
    billing_notes: "",
    service_notes: "",
    communication_preference: "email",
  });

  const [contacts, setContacts] = useState<ContactInput[]>([
    defaultContact({ role: "Fleet Manager", can_approve_work: true, receives_reports: true, view_vehicles: true, view_service_history: true, manage_vehicles: true, download_reports: true, is_primary: true }),
  ]);

  const updateField = (field: string, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const addContact = () => setContacts((p) => [...p, defaultContact()]);
  const removeContact = (idx: number) => setContacts((p) => p.filter((_, i) => i !== idx));

  const updateContact = (idx: number, field: string, value: any) => {
    setContacts((p) => p.map((c, i) => {
      if (i !== idx) return c;
      const updated = { ...c, [field]: value };
      // Apply smart defaults when role changes
      if (field === "role" && ROLE_DEFAULTS[value as string]) {
        return { ...updated, ...ROLE_DEFAULTS[value as string] };
      }
      return updated;
    }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!form.company_name.trim()) {
      toast.error("Company name is required");
      return;
    }

    setSaving(true);
    try {
      await createFleetClient(user.id, form, contacts as FleetClientContactPayload[]);
      toast.success(`${form.company_name} added to Fleet OS`);
      navigate("/fleet-os/clients");
    } catch (err: any) {
      toast.error(err.message || "Failed to create client");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FleetOSLayout title="Add Fleet Client">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Company Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Company Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Company Name *</Label>
                <Input value={form.company_name} onChange={(e) => updateField("company_name", e.target.value)} placeholder="Acme Logistics Inc." />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="(555) 123-4567" />
              </div>
              <div>
                <Label>Billing Email</Label>
                <Input type="email" value={form.billing_email} onChange={(e) => updateField("billing_email", e.target.value)} placeholder="billing@acme.com" />
              </div>
              <div>
                <Label>Communication Preference</Label>
                <Select value={form.communication_preference} onValueChange={(v) => updateField("communication_preference", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <Label>Address Line 1</Label>
                <Input value={form.address} onChange={(e) => updateField("address", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Address Line 2</Label>
                <Input value={form.address_line_2} onChange={(e) => updateField("address_line_2", e.target.value)} placeholder="Suite, Unit, etc." />
              </div>
              <div>
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => updateField("city", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>State</Label>
                  <Input value={form.state} onChange={(e) => updateField("state", e.target.value)} maxLength={2} />
                </div>
                <div>
                  <Label>Zip</Label>
                  <Input value={form.postal_code} onChange={(e) => updateField("postal_code", e.target.value)} />
                </div>
              </div>
            </div>

            {/* AP Contact */}
            <div className="pt-2 border-t border-border">
              <p className="text-sm font-medium mb-3">Accounts Payable Contact</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>AP Contact Name</Label>
                  <Input value={form.ap_contact_name} onChange={(e) => updateField("ap_contact_name", e.target.value)} />
                </div>
                <div>
                  <Label>AP Email</Label>
                  <Input type="email" value={form.ap_contact_email} onChange={(e) => updateField("ap_contact_email", e.target.value)} />
                </div>
                <div>
                  <Label>AP Phone</Label>
                  <Input value={form.ap_contact_phone} onChange={(e) => updateField("ap_contact_phone", e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">If AP email exists, invoices go here by default. Otherwise falls back to billing email.</p>
            </div>
          </CardContent>
        </Card>

        {/* Financial Behavior */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4" /> Financial Behavior
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Payment Terms</Label>
                <Select value={form.payment_terms} onValueChange={(v) => updateField("payment_terms", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due_on_receipt">Due on Receipt</SelectItem>
                    <SelectItem value="net_15">Net 15</SelectItem>
                    <SelectItem value="net_30">Net 30</SelectItem>
                    <SelectItem value="net_45">Net 45</SelectItem>
                    <SelectItem value="net_60">Net 60</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Credit Status</Label>
                <Select value={form.credit_status} onValueChange={(v) => updateField("credit_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="hold">Hold</SelectItem>
                    <SelectItem value="delinquent">Delinquent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Default Pricing Tier</Label>
                <Select value={form.default_pricing_tier} onValueChange={(v) => updateField("default_pricing_tier", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="fleet_discount">Fleet Discount</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.tax_exempt} onCheckedChange={(v) => updateField("tax_exempt", v)} />
              <Label>Tax Exempt</Label>
            </div>
          </CardContent>
        </Card>

        {/* Notes (split into 3 types) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Internal Notes <span className="text-muted-foreground font-normal">(dispatch only)</span></Label>
              <Textarea value={form.internal_notes} onChange={(e) => updateField("internal_notes", e.target.value)} rows={2} placeholder="Notes visible to dispatch team only..." />
            </div>
            <div>
              <Label>Billing Notes <span className="text-muted-foreground font-normal">(AP-specific)</span></Label>
              <Textarea value={form.billing_notes} onChange={(e) => updateField("billing_notes", e.target.value)} rows={2} placeholder="AP instructions, payment quirks..." />
            </div>
            <div>
              <Label>Service Notes <span className="text-muted-foreground font-normal">(technician context)</span></Label>
              <Textarea value={form.service_notes} onChange={(e) => updateField("service_notes", e.target.value)} rows={2} placeholder="Site access, safety requirements..." />
            </div>
          </CardContent>
        </Card>

        {/* Portal Access */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Switch checked={form.portal_access_enabled} onCheckedChange={(v) => updateField("portal_access_enabled", v)} />
              <div>
                <Label className="text-sm font-medium">Enable Fleet Manager Portal Access</Label>
                <p className="text-xs text-muted-foreground">Allow this company to access Fleet Manager Portal for vehicles, service history, reports, and approvals.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contacts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Contacts & Permissions</CardTitle>
              <Button variant="outline" size="sm" onClick={addContact}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Contact
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {contacts.map((contact, idx) => (
              <div key={idx} className="p-4 border border-border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Contact {idx + 1}</p>
                  {contacts.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeContact(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Name</Label>
                    <Input value={contact.name} onChange={(e) => updateContact(idx, "name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Select value={contact.role} onValueChange={(v) => updateContact(idx, "role", v)}>
                      <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Fleet Manager">Fleet Manager</SelectItem>
                        <SelectItem value="Billing Department">Billing Department</SelectItem>
                        <SelectItem value="Regional Ops Manager">Regional Ops Manager</SelectItem>
                        <SelectItem value="Site Supervisor">Site Supervisor</SelectItem>
                        <SelectItem value="AP Contact">AP Contact</SelectItem>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={contact.email} onChange={(e) => updateContact(idx, "email", e.target.value)} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={contact.phone} onChange={(e) => updateContact(idx, "phone", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Communication Preference</Label>
                  <Select value={contact.communication_preference} onValueChange={(v) => updateContact(idx, "communication_preference", v)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Operations Permissions */}
                <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                  <p className="text-xs font-medium mb-2">Operations</p>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { key: "can_approve_work", label: "Approve Work" },
                      { key: "approve_quotes", label: "Approve Quotes" },
                      { key: "receives_invoices", label: "Receive Invoices" },
                      { key: "receives_reports", label: "Receive Reports" },
                      { key: "download_reports", label: "Download Reports" },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <Switch checked={contact[key as keyof ContactInput] as boolean} onCheckedChange={(v) => updateContact(idx, key, v)} />
                        <Label className="text-xs">{label}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Portal Permissions */}
                <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                  <p className="text-xs font-medium mb-2">Portal Access</p>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { key: "view_vehicles", label: "View Vehicles" },
                      { key: "view_service_history", label: "View Service History" },
                      { key: "manage_vehicles", label: "Manage Vehicles" },
                      { key: "request_service", label: "Request Service" },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2">
                        <Switch checked={contact[key as keyof ContactInput] as boolean} onCheckedChange={(v) => updateContact(idx, key, v)} />
                        <Label className="text-xs">{label}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => navigate("/fleet-os/clients")}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Create Client"}
          </Button>
        </div>
      </div>
    </FleetOSLayout>
  );
};

export default FleetClientNew;
