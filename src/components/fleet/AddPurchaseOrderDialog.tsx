import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@packages/auth";
import { toast } from "@/components/ui/sonner";
import { ShoppingCart } from "lucide-react";

import { createPurchaseOrder, fetchFleetClientOptions } from "@/application/commands/fleet-purchase-order.command";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  clientId?: string;
}

export const AddPurchaseOrderDialog = ({ open, onClose, onCreated, clientId }: Props) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Array<{ id: string; company_name: string }>>([]);

  const [form, setForm] = useState({
    fleet_client_id: clientId || "",
    po_number: "",
    description: "",
    amount_limit: "",
    issued_date: new Date().toISOString().split("T")[0],
    expiry_date: "",
    status: "open",
  });


  useEffect(() => {
    if (!user?.id || !open) return;
    fetchFleetClientOptions(user.id).then(setClients);
  }, [user?.id, open]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (clientId) void Promise.resolve().then(() => set("fleet_client_id", clientId));
  }, [clientId]);

  const handleSave = async () => {
    if (!user?.id || !form.po_number || !form.fleet_client_id) {
      toast.error("Client and PO number are required");
      return;
    }
    setSaving(true);
    try {
      const { warnings } = await createPurchaseOrder(user.id, {
        fleet_client_id: form.fleet_client_id,
        po_number: form.po_number,
        description: form.description || null,
        amount_limit: form.amount_limit ? parseFloat(form.amount_limit) : null,
        issued_date: form.issued_date || null,
        expiry_date: form.expiry_date || null,
        status: form.status,
      });
      toast.success(`PO ${form.po_number} created`);
      warnings.forEach((w) => toast.warning(w));
      setForm({ fleet_client_id: "", po_number: "", description: "", amount_limit: "", issued_date: new Date().toISOString().split("T")[0], expiry_date: "", status: "open" });
      onCreated();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create PO";
      toast.error(msg);
    }
    setSaving(false);
  };


  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-orange-600" /> Add Purchase Order
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
              <Label>PO Number *</Label>
              <Input placeholder="PO-2025-001" value={form.po_number} onChange={(e) => set("po_number", e.target.value)} />
            </div>
            <div>
              <Label>Authorized Amount ($)</Label>
              <Input type="number" placeholder="5000.00" value={form.amount_limit} onChange={(e) => set("amount_limit", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea placeholder="Services covered by this PO…" value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Issue Date</Label>
              <Input type="date" value={form.issued_date} onChange={(e) => set("issued_date", e.target.value)} />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiry_date} onChange={(e) => set("expiry_date", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="partially_used">Partially Used</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Create PO"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
