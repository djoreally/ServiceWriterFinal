/**
 * SmartUpsellsCard - Displays and manages the services flagged as "Smart Upsells"
 * These are pre-configured add-ons (air filter, cabin filter, wiper blades) shown
 * during the booking checkout step to increase average ticket value.
 */

import { errorMessage } from "@/lib/error-message";
import { useState, useEffect, useCallback } from "react";
import {
  fetchUpsells as fetchUpsellsQuery,
  updateUpsell,
  toggleUpsellActive,
  loadDefaultUpsellTemplates,
  addUpsell,
  type UpsellItem,
} from "@/application/queries/upsells.query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Pencil, Check, X, DollarSign, Plus, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { bankersRound, formatMoney } from "@/lib/financialMath";

// UpsellItem type imported from application layer

interface EditingState {
  id: string;
  name: string;
  description: string;
  default_price: string;
  is_active: boolean;
}

export function SmartUpsellsCard({ onRefresh }: { onRefresh?: () => void }) {
  const [upsells, setUpsells] = useState<UpsellItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", description: "", default_price: "" });
  const [saving, setSaving] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const fetchUpsells = useCallback(async () => {
    const data = await fetchUpsellsQuery();
    setUpsells(data);
    setLoading(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(() => fetchUpsells()); }, [fetchUpsells]);

  const startEdit = (item: UpsellItem) => {
    setEditing({
      id: item.id,
      name: item.name,
      description: item.description || "",
      default_price: item.default_price.toString(),
      is_active: item.is_active,
    });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateUpsell(editing.id, {
        name: editing.name,
        description: editing.description || null,
        default_price: bankersRound(Number(editing.default_price) || 0, 2),
        is_active: editing.is_active,
      });
      toast({ title: "Upsell updated" });
      setEditing(null);
      fetchUpsells();
      onRefresh?.();
    } catch (err: unknown) {
      toast({ title: "Error saving upsell", description: errorMessage(err), variant: "destructive" });
    }
    setSaving(false);
  };

  const handleToggleActive = async (item: UpsellItem) => {
    try {
      await toggleUpsellActive(item.id, item.is_active);
      fetchUpsells();
      onRefresh?.();
    } catch { /* ignore */ }
  };

  const handleLoadDefaultTemplates = async () => {
    setLoadingTemplates(true);
    const existingNames = new Set(upsells.map((u) => u.name.toLowerCase()));
    try {
      const count = await loadDefaultUpsellTemplates(existingNames);
      if (count === 0) {
        toast({ title: "Templates already loaded", description: "All default upsells are already in your catalog." });
      } else {
        toast({ title: `${count} default upsell(s) added to your catalog` });
        fetchUpsells();
        onRefresh?.();
      }
    } catch (err: unknown) {
      toast({ title: "Error loading templates", description: errorMessage(err), variant: "destructive" });
    }
    setLoadingTemplates(false);
  };

  const handleAddUpsell = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addUpsell({
        name: addForm.name,
        description: addForm.description || null,
        default_price: bankersRound(Number(addForm.default_price) || 0, 2),
      });
      toast({ title: "Smart upsell added" });
      setAddForm({ name: "", description: "", default_price: "" });
      setAddDialogOpen(false);
      fetchUpsells();
      onRefresh?.();
    } catch (err: unknown) {
      toast({ title: "Error adding upsell", description: errorMessage(err), variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Smart Upsells
          </CardTitle>
          <CardDescription className="mt-1">
            Shown as recommended add-ons during customer checkout. Manage and edit them here — they also appear in your full service list below.
          </CardDescription>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleLoadDefaultTemplates}
            disabled={loadingTemplates}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Load Templates
          </Button>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Smart Upsell</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddUpsell} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="upsell-name">Name *</Label>
                  <Input
                    id="upsell-name"
                    value={addForm.name}
                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., Engine Air Filter Replacement"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upsell-desc">Description</Label>
                  <Textarea
                    id="upsell-desc"
                    value={addForm.description}
                    onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description shown to the customer"
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upsell-price">Price ($) *</Label>
                  <Input
                    id="upsell-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={addForm.default_price}
                    onChange={e => setAddForm(f => ({ ...f, default_price: e.target.value }))}
                    placeholder="24.99"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saving}>Add Upsell</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : upsells.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">No smart upsells configured yet.</p>
            <Button variant="outline" size="sm" onClick={handleLoadDefaultTemplates} disabled={loadingTemplates}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Load Default Templates (Air Filter, Cabin Filter, Wiper Blades)
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {upsells.map(item => (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  item.is_active ? "bg-background" : "bg-muted/40 opacity-60"
                }`}
              >
                {editing?.id === item.id ? (
                  /* ── Inline edit mode ── */
                  <div className="flex-1 space-y-2">
                    <Input
                      value={editing.name}
                      onChange={e => setEditing(s => s && { ...s, name: e.target.value })}
                      className="h-8 text-sm font-medium"
                    />
                    <Input
                      value={editing.description}
                      onChange={e => setEditing(s => s && { ...s, description: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="Description"
                    />
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          value={editing.default_price}
                          onChange={e => setEditing(s => s && { ...s, default_price: e.target.value })}
                          className="h-8 text-sm pl-7 w-28"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={editing.is_active}
                          onCheckedChange={v => setEditing(s => s && { ...s, is_active: v })}
                          className="scale-75"
                        />
                        <span className="text-xs text-muted-foreground">Active</span>
                      </div>
                      <div className="flex gap-1 ml-auto">
                        <Button size="icon" className="h-7 w-7" onClick={saveEdit} disabled={saving}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Display mode ── */
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{item.name}</p>
                        {!item.is_active && (
                          <Badge variant="outline" className="text-xs">Inactive</Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold whitespace-nowrap text-primary">
                      ${formatMoney(item.default_price)}
                    </span>
                    <Switch
                      checked={item.is_active}
                      onCheckedChange={() => handleToggleActive(item)}
                      className="scale-75"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => startEdit(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
