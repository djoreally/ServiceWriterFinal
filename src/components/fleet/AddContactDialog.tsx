import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fetchFleetClientOptionsForContact, createFleetContact, updateFleetContact } from "@/application/commands";
import { useAuth } from "@packages/auth";
import { toast } from "@/components/ui/sonner";
import { UserPlus } from "lucide-react";

// Smart defaults per role
const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  "Fleet Manager": { can_approve_work: true, receives_reports: true, view_vehicles: true, view_service_history: true, manage_vehicles: true, download_reports: true },
  "Billing Department": { receives_invoices: true },
  "Admin": { can_approve_work: true, receives_invoices: true, receives_reports: true, view_vehicles: true, view_service_history: true, request_service: true, manage_vehicles: true, download_reports: true, approve_quotes: true },
  "AP Contact": { receives_invoices: true },
  "Regional Ops Manager": { receives_reports: true, view_vehicles: true, view_service_history: true, download_reports: true },
  "Site Supervisor": { view_vehicles: true, view_service_history: true },
};

const ALL_PERMISSIONS = [
  "can_approve_work", "receives_invoices", "receives_reports", "is_primary",
  "view_vehicles", "view_service_history", "request_service", "manage_vehicles",
  "download_reports", "approve_quotes",
] as const;

const defaultForm = (clientId?: string) => ({
  fleet_client_id: clientId || "",
  name: "",
  role: "",
  email: "",
  phone: "",
  can_approve_work: false,
  receives_invoices: false,
  receives_reports: false,
  is_primary: false,
  view_vehicles: false,
  view_service_history: false,
  request_service: false,
  manage_vehicles: false,
  download_reports: false,
  approve_quotes: false,
  communication_preference: "email",
});

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  clientId?: string;
  editingContact?: any;
}

export const AddContactDialog = ({ open, onClose, onCreated, clientId, editingContact }: Props) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [form, setForm] = useState(defaultForm(clientId));

  useEffect(() => {
    if (editingContact) {
      setForm({
        fleet_client_id: editingContact.fleet_client_id || clientId || "",
        name: editingContact.name || "",
        role: editingContact.role || "",
        email: editingContact.email || "",
        phone: editingContact.phone || "",
        can_approve_work: !!editingContact.can_approve_work,
        receives_invoices: !!editingContact.receives_invoices,
        receives_reports: !!editingContact.receives_reports,
        is_primary: !!editingContact.is_primary,
        view_vehicles: !!editingContact.view_vehicles,
        view_service_history: !!editingContact.view_service_history,
        request_service: !!editingContact.request_service,
        manage_vehicles: !!editingContact.manage_vehicles,
        download_reports: !!editingContact.download_reports,
        approve_quotes: !!editingContact.approve_quotes,
        communication_preference: editingContact.communication_preference || "email",
      });
    } else {
      setForm(defaultForm(clientId));
    }
  }, [editingContact, clientId, open]);

  useEffect(() => {
    if (!user?.id || !open) return;
    fetchFleetClientOptionsForContact(user.id).then(setClients);
  }, [user?.id, open]);

  const set = (k: string, v: string | boolean) => {
    setForm((f) => {
      const updated = { ...f, [k]: v };
      // Apply smart defaults when role changes
      if (k === "role" && typeof v === "string" && ROLE_DEFAULTS[v]) {
        const defaults = ROLE_DEFAULTS[v];
        // Reset all permissions first, then apply defaults
        ALL_PERMISSIONS.forEach((p) => {
          if (p !== "is_primary") (updated as any)[p] = defaults[p] || false;
        });
      }
      return updated;
    });
  };

  const handleSave = async () => {
    if (!user?.id || !form.name || !form.fleet_client_id) {
      toast.error("Client and contact name are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fleet_client_id: form.fleet_client_id,
        name: form.name,
        role: form.role || null,
        email: form.email || null,
        phone: form.phone || null,
        can_approve_work: form.can_approve_work,
        receives_invoices: form.receives_invoices,
        receives_reports: form.receives_reports,
        is_primary: form.is_primary,
        view_vehicles: form.view_vehicles,
        view_service_history: form.view_service_history,
        request_service: form.request_service,
        manage_vehicles: form.manage_vehicles,
        download_reports: form.download_reports,
        approve_quotes: form.approve_quotes,
        communication_preference: form.communication_preference,
      };

      if (editingContact) {
        await updateFleetContact(editingContact.id, payload);
        toast.success("Contact updated");
      } else {
        await createFleetContact(user.id, payload);
        toast.success("Contact added");
      }
      onCreated();
      onClose();
    } catch {
      toast.error("Failed to save contact");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> {editingContact ? "Edit Contact" : "Add Contact"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!clientId && (
            <div>
              <Label>Client *</Label>
              <Select value={form.fleet_client_id} onValueChange={(v) => set("fleet_client_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Full Name *</Label>
              <Input placeholder="Jane Smith" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <Label>Role / Title</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v)}>
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input type="email" placeholder="jane@company.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input placeholder="(555) 000-0000" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Communication Preference</Label>
            <Select value={form.communication_preference} onValueChange={(v) => set("communication_preference", v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Operations Permissions */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/50">
            <p className="text-sm font-medium mb-2">Operations</p>
            {[
              { key: "can_approve_work", label: "Can Approve Work", desc: "Authorized to approve work orders and estimates" },
              { key: "approve_quotes", label: "Approve Quotes", desc: "Can approve service quotes separately from work orders" },
              { key: "receives_invoices", label: "Receives Invoices", desc: "Gets invoice copies via email" },
              { key: "receives_reports", label: "Receives Reports", desc: "Gets service and analytics reports" },
              { key: "download_reports", label: "Download Reports", desc: "Can download reports from portal" },
              { key: "is_primary", label: "Primary Contact", desc: "Default point of contact for this client" },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                <div>
                  <p className="text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch checked={form[key as keyof typeof form] as boolean} onCheckedChange={(v) => set(key, v)} />
              </div>
            ))}
          </div>

          {/* Portal Permissions */}
          <div className="space-y-2 p-3 rounded-lg bg-muted/50">
            <p className="text-sm font-medium mb-2">Portal Access</p>
            {[
              { key: "view_vehicles", label: "View Vehicles", desc: "Can see fleet vehicle list" },
              { key: "view_service_history", label: "View Service History", desc: "Can see past service records" },
              { key: "manage_vehicles", label: "Manage Vehicles", desc: "Can add/edit vehicle records" },
              { key: "request_service", label: "Request Service", desc: "Can submit service requests through portal" },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                <div>
                  <p className="text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch checked={form[key as keyof typeof form] as boolean} onCheckedChange={(v) => set(key, v)} />
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editingContact ? "Update Contact" : "Add Contact"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
