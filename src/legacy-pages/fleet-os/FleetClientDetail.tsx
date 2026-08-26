import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@packages/auth";
import {
  fetchFleetClient,
  fetchClientCounts,
  fetchClientReportStats,
  fetchClientContacts,
  fetchClientVehicles,
  fetchClientWorkOrders,
  fetchClientLocations,
  fetchClientContracts,
  fetchClientPurchaseOrders,
  fetchFleetClientReadiness,
  type FleetClientReadiness,
} from "@/application/queries/fleet-client-detail.query";
import { updateFleetClient } from "@/application/commands/fleet-client-detail.command";
import {
  deleteFleetVehicle,
  deleteFleetLocation,
  deleteFleetContact,
  deleteFleetContract,
  deletePurchaseOrder,
} from "@/application/commands";
import {
  Building2,
  ArrowLeft,
  Car,
  ClipboardList,
  MapPin,
  FileText,
  Receipt,
  ShoppingCart,
  BarChart3,
  Users,
  Phone,
  Mail,
  DollarSign,
  Calendar,
  Clock,
  Shield,
  Plus,
  Search,
  ChevronRight,
  Hash,
  Gauge,
  Pencil,
  Trash2,
  Activity,
  Copy,
} from "lucide-react";
import { FleetOpsFeed } from "@/components/fleet/FleetOpsFeed";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { AddVehicleDialog } from "@/components/fleet/AddVehicleDialog";
import { AddLocationDialog } from "@/components/fleet/AddLocationDialog";
import { AddContactDialog } from "@/components/fleet/AddContactDialog";
import { AddContractDialog } from "@/components/fleet/AddContractDialog";
import { AddPurchaseOrderDialog } from "@/components/fleet/AddPurchaseOrderDialog";
import { openFleetInvoiceWorkflow } from "@/application/navigation/fleet-invoice-routes";
import { fetchFleetInvoices, type FleetInvoiceRow } from "@/application/queries/fleet-invoices.query";
import { normalizeFleetInvoiceStatus } from "@/application/presenters/fleet-invoice-status";
import { InvoiceDetailDialog } from "@/components/invoices/InvoiceDetailDialog";
import { FleetClientReadinessCard } from "@/components/fleet/FleetClientReadinessCard";


// ── Client type ─────────────────────────────────────
interface FleetClient {
  id: string;
  company_name: string;
  status: string;
  phone?: string;
  billing_email?: string;
  website?: string;
  payment_terms?: string;
  address?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  ap_contact_name?: string;
  ap_contact_email?: string;
  ap_contact_phone?: string;
  portal_access_enabled?: boolean;
  notes?: string;
  credit_status?: string;
  default_pricing_tier?: string;
  tax_exempt?: boolean;
  internal_notes?: string;
  billing_notes?: string;
  service_notes?: string;
  communication_preference?: string;
  created_at: string;
}

const paymentTermsLabel: Record<string, string> = {
  due_on_receipt: "Due on Receipt",
  net_15: "Net 15",
  net_30: "Net 30",
  net_45: "Net 45",
  net_60: "Net 60",
};

const FleetClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<FleetClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [readiness, setReadiness] = useState<FleetClientReadiness | null>(null);

  // Dialog states
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [addContractOpen, setAddContractOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<any>(null);
  const [addPOOpen, setAddPOOpen] = useState(false);

  const refreshClient = async () => {
    if (!user?.id || !id) return;
    const { data } = await fetchFleetClient(id, user.id);
    setClient(data);
    setReadiness(await fetchFleetClientReadiness(id));
  };

  useEffect(() => {
    if (!user?.id || !id) return;
    const fetchClient = async () => {
      const [{ data }, readinessResult] = await Promise.all([fetchFleetClient(id, user.id), fetchFleetClientReadiness(id)]);
      setClient(data);
      setReadiness(readinessResult);
      setLoading(false);
    };
    fetchClient();
  }, [user?.id, id]);

  if (loading) {
    return (
      <FleetOSLayout title="Client">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </FleetOSLayout>
    );
  }

  if (!client) {
    return (
      <FleetOSLayout title="Client Not Found">
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="font-medium">Client not found</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/fleet-os/clients")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Clients
            </Button>
          </CardContent>
        </Card>
      </FleetOSLayout>
    );
  }

  return (
    <FleetOSLayout title={client.company_name}>
      <div className="space-y-4">
        {/* Back + Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/fleet-os/clients")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold truncate">{client.company_name}</h1>
              <Badge
                variant="secondary"
                className={client.status === "active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}
              >
                {client.status}
              </Badge>
            </div>
           </div>
          {client.portal_access_enabled && <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/fleet-manager/auth?returnTo=/fleet-manager`); toast.success("Fleet Manager portal link copied"); }}><Copy className="mr-1 h-3.5 w-3.5"/>Portal link</Button>}
          <Button variant="outline" size="sm" onClick={() => { setEditing(!editing); setActiveTab("overview"); }}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> {editing ? "Cancel Edit" : "Edit"}
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
            {[
              { value: "overview", label: "Overview", icon: Building2 },
              { value: "vehicles", label: "Vehicles", icon: Car },
              { value: "work-orders", label: "Work Orders", icon: ClipboardList },
              { value: "activity", label: "Activity", icon: Activity },
              { value: "locations", label: "Locations", icon: MapPin },
              { value: "contracts", label: "Contracts", icon: FileText },
              { value: "invoices", label: "Invoices", icon: Receipt },
              { value: "pos", label: "POs", icon: ShoppingCart },
              { value: "reports", label: "Reports", icon: BarChart3 },
              { value: "contacts", label: "Contacts", icon: Users },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs px-3 py-1.5 rounded-md border border-border data-[state=active]:border-primary gap-1.5"
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
              </TabsTrigger>
            ))}

          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <div className="space-y-4">
              {readiness && <FleetClientReadinessCard readiness={readiness} onOpenStep={setActiveTab} onImport={() => navigate(`/fleet-os/vehicles/import?clientId=${client.id}`)} onCreateJob={() => navigate(`/fleet-os/work-orders/new?clientId=${client.id}`)} />}
              <ClientOverviewTab client={client} editing={editing} onSaved={(updated) => { setClient(updated); setEditing(false); }} />
            </div>
          </TabsContent>
          <TabsContent value="vehicles" className="mt-4">
            <ClientVehiclesTab clientId={id!} onAdd={() => setAddVehicleOpen(true)} onEdit={(v) => { setEditingVehicle(v); setAddVehicleOpen(true); }} />
          </TabsContent>
          <TabsContent value="work-orders" className="mt-4">
            <ClientWorkOrdersTab clientId={id!} />
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <FleetOpsFeed fleetClientId={id!} title="Operations feed" />
          </TabsContent>

          <TabsContent value="locations" className="mt-4">
            <ClientLocationsTab clientId={id!} onAdd={() => setAddLocationOpen(true)} onEdit={(l) => { setEditingLocation(l); setAddLocationOpen(true); }} />
          </TabsContent>
          <TabsContent value="contracts" className="mt-4">
            <ClientContractsTab clientId={id!} onAdd={() => setAddContractOpen(true)} onEdit={(c) => { setEditingContract(c); setAddContractOpen(true); }} />
          </TabsContent>
          <TabsContent value="invoices" className="mt-4">
            <ClientInvoicesTab clientId={id!} />
          </TabsContent>
          <TabsContent value="pos" className="mt-4">
            <ClientPOsTab clientId={id!} onAdd={() => setAddPOOpen(true)} />
          </TabsContent>
          <TabsContent value="reports" className="mt-4">
            <ClientReportsTab clientId={id!} />
          </TabsContent>
          <TabsContent value="contacts" className="mt-4">
            <ClientContactsTab clientId={id!} onAdd={() => setAddContactOpen(true)} onEdit={(c) => { setEditingContact(c); setAddContactOpen(true); }} />
          </TabsContent>
        </Tabs>
      </div>

      <AddVehicleDialog
        open={addVehicleOpen}
        onClose={() => { setAddVehicleOpen(false); setEditingVehicle(null); }}
        clientId={id}
        editingVehicle={editingVehicle}
        onCreated={refreshClient}
      />
      <AddLocationDialog
        open={addLocationOpen}
        onClose={() => { setAddLocationOpen(false); setEditingLocation(null); }}
        clientId={id}
        editingLocation={editingLocation}
        onCreated={refreshClient}
      />
      <AddContactDialog
        open={addContactOpen}
        onClose={() => { setAddContactOpen(false); setEditingContact(null); }}
        clientId={id}
        editingContact={editingContact}
        onCreated={refreshClient}
      />
      <AddContractDialog
        open={addContractOpen}
        onClose={() => { setAddContractOpen(false); setEditingContract(null); }}
        clientId={id}
        editingContract={editingContract}
        onCreated={refreshClient}
      />
      <AddPurchaseOrderDialog
        open={addPOOpen}
        onClose={() => setAddPOOpen(false)}
        clientId={id}
        onCreated={refreshClient}
      />
    </FleetOSLayout>
  );
};

// ── Overview Tab ──────────────────────────────────────
function ClientOverviewTab({ client, editing, onSaved }: { client: FleetClient; editing: boolean; onSaved: (updated: FleetClient) => void }) {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ vehicles: 0, workOrders: 0, locations: 0, contacts: 0, contracts: 0 });
  const [saving, setSaving] = useState(false);
  const buildForm = () => ({
    company_name: client.company_name,
    phone: client.phone || "",
    billing_email: client.billing_email || "",
    payment_terms: client.payment_terms || "net_30",
    address: client.address || "",
    address_line_2: client.address_line_2 || "",
    city: client.city || "",
    state: client.state || "",
    postal_code: client.postal_code || "",
    ap_contact_name: client.ap_contact_name || "",
    ap_contact_email: client.ap_contact_email || "",
    ap_contact_phone: client.ap_contact_phone || "",
    portal_access_enabled: client.portal_access_enabled || false,
    notes: client.notes || "",
    status: client.status || "active",
    credit_status: client.credit_status || "active",
    default_pricing_tier: client.default_pricing_tier || "retail",
    tax_exempt: client.tax_exempt || false,
    internal_notes: client.internal_notes || "",
    billing_notes: client.billing_notes || "",
    service_notes: client.service_notes || "",
    communication_preference: client.communication_preference || "email",
  });
  const [form, setForm] = useState(buildForm());

  // Reset form when client or editing changes
  useEffect(() => {
    setForm(buildForm());
  }, [client, editing]);

  const updateField = (field: string, value: string | boolean) => setForm((p) => ({ ...p, [field]: value }));

  const handleSave = async () => {
    if (!form.company_name.trim()) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await updateFleetClient(client.id, form);
      if (error) throw error;
      toast.success("Client updated");
      onSaved(data as FleetClient);
    } catch (err: any) {
      toast.error(err.message || "Failed to update client");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    const fetchCounts = async () => {
      const counts = await fetchClientCounts(client.id);
      setCounts(counts);
    };
    fetchCounts();
  }, [user?.id, client.id]);

  if (editing) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Company Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Company Name *</Label><Input value={form.company_name} onChange={(e) => updateField("company_name", e.target.value)} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} /></div>
              <div><Label>Billing Email</Label><Input type="email" value={form.billing_email} onChange={(e) => updateField("billing_email", e.target.value)} /></div>
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
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => updateField("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => updateField("address", e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Address Line 2</Label><Input value={form.address_line_2} onChange={(e) => updateField("address_line_2", e.target.value)} placeholder="Suite, Unit, etc." /></div>
              <div><Label>City</Label><Input value={form.city} onChange={(e) => updateField("city", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>State</Label><Input value={form.state} onChange={(e) => updateField("state", e.target.value)} maxLength={2} /></div>
                <div><Label>Zip</Label><Input value={form.postal_code} onChange={(e) => updateField("postal_code", e.target.value)} /></div>
              </div>
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-sm font-medium mb-3">Financial Behavior</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <Label>Pricing Tier</Label>
                  <Select value={form.default_pricing_tier} onValueChange={(v) => updateField("default_pricing_tier", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="fleet_discount">Fleet Discount</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                    </SelectContent>
                  </Select>
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
              <div className="flex items-center gap-2 mt-3">
                <Switch checked={form.tax_exempt} onCheckedChange={(v) => updateField("tax_exempt", v)} />
                <Label>Tax Exempt</Label>
              </div>
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-sm font-medium mb-3">Accounts Payable Contact</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><Label>AP Contact Name</Label><Input value={form.ap_contact_name} onChange={(e) => updateField("ap_contact_name", e.target.value)} /></div>
                <div><Label>AP Email</Label><Input type="email" value={form.ap_contact_email} onChange={(e) => updateField("ap_contact_email", e.target.value)} /></div>
                <div><Label>AP Phone</Label><Input value={form.ap_contact_phone} onChange={(e) => updateField("ap_contact_phone", e.target.value)} /></div>
              </div>
            </div>
            <div className="pt-2 border-t border-border">
              <p className="text-sm font-medium mb-3">Notes</p>
              <div className="space-y-3">
                <div><Label>Internal Notes <span className="text-muted-foreground font-normal">(dispatch only)</span></Label><Textarea value={form.internal_notes} onChange={(e) => updateField("internal_notes", e.target.value)} rows={2} /></div>
                <div><Label>Billing Notes <span className="text-muted-foreground font-normal">(AP-specific)</span></Label><Textarea value={form.billing_notes} onChange={(e) => updateField("billing_notes", e.target.value)} rows={2} /></div>
                <div><Label>Service Notes <span className="text-muted-foreground font-normal">(technician context)</span></Label><Textarea value={form.service_notes} onChange={(e) => updateField("service_notes", e.target.value)} rows={2} /></div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.portal_access_enabled} onCheckedChange={(v) => updateField("portal_access_enabled", v)} />
              <Label>Enable Fleet Manager Portal Access</Label>
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onSaved(client)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        </div>
      </div>
    );
  }

  const creditStatusStyles: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600",
    hold: "bg-amber-500/10 text-amber-600",
    delinquent: "bg-red-500/10 text-red-500",
  };

  const pricingTierLabels: Record<string, string> = {
    retail: "Retail",
    fleet_discount: "Fleet Discount",
    contract: "Contract",
  };

  return (
    <div className="space-y-4">
      {/* Client Info */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex flex-wrap gap-2 mb-2">
            {client.credit_status && (
              <Badge variant="secondary" className={creditStatusStyles[client.credit_status] || ""}>
                Credit: {client.credit_status}
              </Badge>
            )}
            {client.default_pricing_tier && (
              <Badge variant="secondary" className="bg-muted text-muted-foreground">
                {pricingTierLabels[client.default_pricing_tier] || client.default_pricing_tier}
              </Badge>
            )}
            {client.tax_exempt && (
              <Badge variant="secondary" className="bg-purple-500/10 text-purple-600">Tax Exempt</Badge>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {client.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" /> {client.phone}
              </div>
            )}
            {client.billing_email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" /> {client.billing_email}
              </div>
            )}
            {client.payment_terms && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" /> {paymentTermsLabel[client.payment_terms] || client.payment_terms}
              </div>
            )}
          </div>
          {(client.address || client.city || client.state) && (
            <p className="text-sm text-muted-foreground">
              {[client.address, client.address_line_2, client.city, client.state, client.postal_code].filter(Boolean).join(", ")}
            </p>
          )}
          {/* Split notes display */}
          {client.internal_notes && (
            <div className="text-sm"><span className="font-medium text-foreground">Dispatch: </span><span className="text-muted-foreground italic">{client.internal_notes}</span></div>
          )}
          {client.billing_notes && (
            <div className="text-sm"><span className="font-medium text-foreground">Billing: </span><span className="text-muted-foreground italic">{client.billing_notes}</span></div>
          )}
          {client.service_notes && (
            <div className="text-sm"><span className="font-medium text-foreground">Service: </span><span className="text-muted-foreground italic">{client.service_notes}</span></div>
          )}
          {client.notes && !client.internal_notes && !client.billing_notes && !client.service_notes && (
            <p className="text-sm text-muted-foreground italic">{client.notes}</p>
          )}
        </CardContent>
      </Card>

      {/* Quick Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Vehicles", count: counts.vehicles, icon: Car },
          { label: "Work Orders", count: counts.workOrders, icon: ClipboardList },
          { label: "Locations", count: counts.locations, icon: MapPin },
          { label: "Contacts", count: counts.contacts, icon: Users },
          { label: "Contracts", count: counts.contracts, icon: FileText },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4 text-center">
              <item.icon className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{item.count}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Vehicles Tab ──────────────────────────────────────
function ClientVehiclesTab({ clientId, onAdd, onEdit }: { clientId: string; onAdd: () => void; onEdit: (v: any) => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data } = await fetchClientVehicles(clientId);
    setVehicles(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id, clientId]);

  const handleDelete = async (vehicleId: string) => {
    if (!confirm("Are you sure you want to delete this vehicle?")) return;
    try {
      await deleteFleetVehicle(vehicleId);
      toast.success("Vehicle deleted");
      load();
    } catch (err: any) {
      toast.error("Failed to delete vehicle");
    }
  };

  const filtered = vehicles.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return v.make?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) ||
      v.vin?.toLowerCase().includes(q) || v.unit_number?.toLowerCase().includes(q);
  });

  const statusStyles: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600",
    inactive: "bg-muted text-muted-foreground",
    maintenance: "bg-amber-500/10 text-amber-600",
    retired: "bg-red-500/10 text-red-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Add Vehicle</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search vehicles..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Car className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No vehicles for this client</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => (
            <Card key={v.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(`/fleet-os/vehicles/${v.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{v.year} {v.make} {v.model}</p>
                      <Badge variant="secondary" className={statusStyles[v.status] || ""}>{v.status}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {v.unit_number && <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {v.unit_number}</span>}
                      {v.vin && <span className="font-mono text-[11px]">{v.vin}</span>}
                      {v.mileage && <span className="flex items-center gap-1"><Gauge className="h-3 w-3" /> {v.mileage.toLocaleString()} mi</span>}
                      {v.license_plate && <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{v.license_plate}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onEdit(v); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); handleDelete(v.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Work Orders Tab ───────────────────────────────────
function ClientWorkOrdersTab({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    const fetch = async () => {
      const { data } = await fetchClientWorkOrders(clientId);
      setOrders(data ?? []);
      setLoading(false);
    };
    fetch();
  }, [user?.id, clientId]);

  const filtered = orders.filter((o: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return o.order_number?.toLowerCase().includes(q) || o.service_type?.toLowerCase().includes(q);
  });

  const statusStyles: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    scheduled: "bg-blue-500/10 text-blue-600",
    in_progress: "bg-amber-500/10 text-amber-600",
    completed: "bg-emerald-500/10 text-emerald-600",
    invoiced: "bg-purple-500/10 text-purple-600",
    paid: "bg-gray-500/10 text-gray-600",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{orders.length} work order{orders.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={() => navigate(`/fleet-os/work-orders/new?clientId=${clientId}`)}><Plus className="h-4 w-4 mr-1" /> New Work Order</Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search work orders..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No work orders for this client</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((o: any) => {
            const vehicle = o.fleet_vehicles;
            return (
              <Card key={o.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate(`/fleet-os/work-orders/${o.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{o.order_number || "—"}</p>
                        <Badge variant="secondary" className={statusStyles[o.status] || ""}>{o.status?.replace("_", " ")}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {vehicle && <span>{vehicle.year} {vehicle.make} {vehicle.model}{vehicle.unit_number && ` (#${vehicle.unit_number})`}</span>}
                        {o.service_type && <span>{o.service_type}</span>}
                        {o.scheduled_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {o.scheduled_date}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {o.total > 0 && <span className="text-sm font-medium">${o.total.toFixed(2)}</span>}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Locations Tab ─────────────────────────────────────
function ClientLocationsTab({ clientId, onAdd, onEdit }: { clientId: string; onAdd: () => void; onEdit: (l: any) => void }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await fetchClientLocations(clientId);
    setLocations(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id, clientId]);

  const handleDelete = async (locId: string) => {
    if (!confirm("Are you sure you want to delete this location?")) return;
    try {
      await deleteFleetLocation(locId);
      toast.success("Location deleted");
      load();
    } catch (err: any) {
      toast.error("Failed to delete location");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{locations.length} location{locations.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Add Location</Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
      ) : locations.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <MapPin className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No locations for this client</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {locations.map((l) => (
            <Card key={l.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <MapPin className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{l.name}</p>
                      {l.is_primary && <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">Primary</Badge>}
                    </div>
                    {l.address && <p className="text-xs text-muted-foreground mt-0.5">{l.address}{l.city && `, ${l.city}`}{l.state && `, ${l.state}`} {l.postal_code}</p>}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {(l.service_window_start || l.service_window_end) && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {l.service_window_start || "?"} – {l.service_window_end || "?"}</span>}
                      {l.site_contact_name && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {l.site_contact_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(l)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(l.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Contracts Tab ─────────────────────────────────────
function ClientContractsTab({ clientId, onAdd, onEdit }: { clientId: string; onAdd: () => void; onEdit: (c: any) => void }) {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await fetchClientContracts(clientId);
    setContracts(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id, clientId]);

  const handleDelete = async (contractId: string) => {
    if (!confirm("Are you sure you want to delete this contract?")) return;
    try {
      await deleteFleetContract(contractId);
      toast.success("Contract deleted");
      load();
    } catch (err: any) {
      toast.error("Failed to delete contract");
    }
  };

  const invoiceFreqLabels: Record<string, string> = {
    per_service: "Per Service", weekly: "Weekly", biweekly: "Bi-Weekly", monthly: "Monthly",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{contracts.length} contract{contracts.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> New Contract</Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
      ) : contracts.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No contracts for this client</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => (
            <Card key={c.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{c.name}</p>
                      <Badge variant="secondary" className={c.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}>
                        {c.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {c.sla_hours && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> SLA: {c.sla_hours}h</span>}
                      {c.approval_threshold && <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Approval &gt; ${Number(c.approval_threshold).toLocaleString()}</span>}
                      {c.invoice_frequency && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {invoiceFreqLabels[c.invoice_frequency] || c.invoice_frequency}</span>}
                      {(c.start_date || c.end_date) && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {c.start_date || "?"} → {c.end_date || "ongoing"}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Invoices Tab ──────────────────────────────────────
function ClientInvoicesTab({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<FleetInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    const fetch = async () => {
      setLoading(true);
      try {
        const data = await fetchFleetInvoices(user.id, clientId);
        setInvoices(data);
      } catch (error) {
        console.error("[ClientInvoicesTab] Failed to load invoices", error);
        toast.error("Unable to load this client's invoices");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [user?.id, clientId, reloadKey]);

  const statusStyles: Record<string, string> = {
    draft: "bg-amber-500/10 text-amber-600",
    sent: "bg-blue-500/10 text-blue-600",
    partial: "bg-purple-500/10 text-purple-600",
    paid: "bg-emerald-500/10 text-emerald-600",
    void: "bg-muted text-muted-foreground",
  };

  const totalOutstanding = invoices
    .filter((invoice) => !["paid", "void"].includes(normalizeFleetInvoiceStatus(invoice.status)))
    .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - Number(invoice.amount_paid || 0)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
          {totalOutstanding > 0 && <span className="ml-2 text-amber-600 font-medium">• ${totalOutstanding.toFixed(2)} outstanding</span>}
        </p>
        <Button size="sm" onClick={() => openFleetInvoiceWorkflow(navigate, clientId)}><Plus className="h-4 w-4 mr-1" /> Generate Invoice</Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
      ) : invoices.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Receipt className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No invoices for this client</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {invoices.map((invoice) => {
            const invoiceStatus = normalizeFleetInvoiceStatus(invoice.status);
            const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid || 0));
            return (
              <Card key={invoice.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelectedInvoiceId(invoice.id)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{invoice.invoice_number}</p>
                        <Badge variant="secondary" className={statusStyles[invoiceStatus] || ""}>{invoiceStatus}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span>Issued {new Date(invoice.issue_date).toLocaleDateString()}</span>
                        {invoice.due_date && <span>Due {new Date(invoice.due_date).toLocaleDateString()}</span>}
                        {Number(invoice.amount_paid) > 0 && <span>${Number(invoice.amount_paid).toFixed(2)} paid</span>}
                      </div>
                    </div>
                    <span className="text-sm font-semibold shrink-0">${balance.toFixed(2)} due</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <InvoiceDetailDialog
        invoiceId={selectedInvoiceId}
        open={Boolean(selectedInvoiceId)}
        onOpenChange={(open) => !open && setSelectedInvoiceId(null)}
        onChanged={() => setReloadKey((key) => key + 1)}
      />
    </div>
  );
}

// ── POs Tab ───────────────────────────────────────────
function ClientPOsTab({ clientId, onAdd }: { clientId: string; onAdd: () => void }) {
  const { user } = useAuth();
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await fetchClientPurchaseOrders(clientId);
    setPos(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id, clientId]);

  const handleDelete = async (poId: string) => {
    if (!confirm("Are you sure you want to delete this purchase order?")) return;
    try {
      await deletePurchaseOrder(poId);
      toast.success("PO deleted");
      load();
    } catch (err: any) {
      toast.error("Failed to delete purchase order");
    }
  };

  const statusStyles: Record<string, string> = {
    open: "bg-emerald-500/10 text-emerald-600",
    partially_used: "bg-amber-500/10 text-amber-600",
    closed: "bg-muted text-muted-foreground",
    expired: "bg-red-500/10 text-red-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{pos.length} PO{pos.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Add PO</Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
      ) : pos.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No purchase orders for this client</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {pos.map((p) => {
            const used = Number(p.amount_used) || 0;
            const limit = Number(p.amount_limit) || 0;
            const remaining = limit > 0 ? limit - used : null;
            return (
              <Card key={p.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-mono font-medium text-sm">{p.po_number}</p>
                        <Badge variant="secondary" className={statusStyles[p.status] || ""}>{p.status?.replace("_", " ")}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                        {limit > 0 && <span><DollarSign className="h-3 w-3 inline" />${used.toLocaleString()} / ${limit.toLocaleString()}</span>}
                        {p.expiry_date && <span>Expires: {p.expiry_date}</span>}
                      </div>
                      {limit > 0 && (
                        <div className="mt-2 w-48">
                          <div className="h-1.5 bg-muted rounded-md overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-md" style={{ width: `${Math.min((used / limit) * 100, 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {remaining !== null && remaining > 0 && (
                        <span className="text-xs text-emerald-600 shrink-0">${remaining.toLocaleString()} left</span>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────
function ClientReportsTab({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  const [stats, setStats] = useState({ totalSpend: 0, vehicleCount: 0, woCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const fetch = async () => {
      const reportStats = await fetchClientReportStats(clientId);
      setStats(reportStats);
      setLoading(false);
    };
    fetch();
  }, [user?.id, clientId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Client analytics</p>
        <Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 mr-1" /> Export</Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Spend", value: loading ? "—" : `$${stats.totalSpend.toFixed(2)}`, icon: DollarSign },
          { label: "Vehicles", value: loading ? "—" : stats.vehicleCount, icon: Car },
          { label: "Work Orders", value: loading ? "—" : stats.woCount, icon: ClipboardList },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4 text-center">
              <card.icon className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-xl font-bold">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Contacts Tab ──────────────────────────────────────
function ClientContactsTab({ clientId, onAdd, onEdit }: { clientId: string; onAdd: () => void; onEdit: (c: any) => void }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await fetchClientContacts(clientId);
    setContacts(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id, clientId]);

  const handleDelete = async (contactId: string) => {
    if (!confirm("Are you sure you want to delete this contact?")) return;
    try {
      await deleteFleetContact(contactId);
      toast.success("Contact deleted");
      load();
    } catch (err: any) {
      toast.error("Failed to delete contact");
    }
  };

  const roleColors: Record<string, string> = {
    "Fleet Manager": "bg-blue-500/10 text-blue-600",
    "Billing Department": "bg-purple-500/10 text-purple-600",
    "Regional Ops Manager": "bg-amber-500/10 text-amber-600",
    "Site Supervisor": "bg-emerald-500/10 text-emerald-600",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</p>
        <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" /> Add Contact</Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
      ) : contacts.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No contacts for this client</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <Card key={c.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{c.name}</p>
                      {c.role && <Badge variant="secondary" className={roleColors[c.role] || "bg-muted text-muted-foreground"}>{c.role}</Badge>}
                      {c.is_primary && <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">Primary</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                      {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>}
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {c.can_approve_work && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md"><Shield className="h-2.5 w-2.5" /> Approve Work</span>}
                      {c.approve_quotes && <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md"><Shield className="h-2.5 w-2.5" /> Quotes</span>}
                      {c.receives_invoices && <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded-md"><Receipt className="h-2.5 w-2.5" /> Invoices</span>}
                      {c.receives_reports && <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-md"><FileText className="h-2.5 w-2.5" /> Reports</span>}
                      {c.download_reports && <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-md"><BarChart3 className="h-2.5 w-2.5" /> Download</span>}
                      {c.view_vehicles && <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-md"><Car className="h-2.5 w-2.5" /> Vehicles</span>}
                      {c.view_service_history && <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-md"><ClipboardList className="h-2.5 w-2.5" /> History</span>}
                      {c.manage_vehicles && <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-md"><Car className="h-2.5 w-2.5" /> Manage</span>}
                      {c.request_service && <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-md"><Plus className="h-2.5 w-2.5" /> Request</span>}
                      {c.communication_preference && c.communication_preference !== "email" && (
                        <span className="inline-flex items-center text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{c.communication_preference}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default FleetClientDetail;
