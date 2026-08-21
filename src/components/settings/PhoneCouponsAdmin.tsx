/**
 * Phone Coupons Admin — list, edit, and disable per-customer phone-based coupons.
 * Each customer with a phone number gets an auto-generated coupon (their phone digits).
 * Overrides are stored in `phone_coupon_overrides` and applied by the
 * `validate_phone_coupon` RPC at booking time.
 */
import { useEffect, useState, useCallback } from "react";
import {
  fetchPhoneCouponData,
  type PhoneCouponOverride as OverrideRow,
} from "@/application/queries/phone-coupons.query";
import {
  upsertPhoneCouponOverride,
  deletePhoneCouponOverride,
} from "@/application/commands/phone-coupons.command";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tag, Loader2, Search, Edit2, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { bankersRound } from "@/lib/financialMath";

interface Override {
  id: string;
  customer_id: string;
  disabled: boolean;
  custom_discount_type: "percentage" | "fixed" | null;
  custom_discount_value: number | null;
  custom_min_order_amount: number | null;
  custom_description: string | null;
  notes: string | null;
}

interface CustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string;
  digits: string;
  override: Override | null;
}

const onlyDigits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
const formatPhone = (digits: string) => {
  const d = digits.slice(-10);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return digits;
};

interface Props {
  enabled: boolean;
}

export const PhoneCouponsAdmin = ({ enabled }: Props) => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [draft, setDraft] = useState<Partial<Override>>({});
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPhoneCouponData();
      if (!result) return;
      const { customers, overrides } = result;

      const ovByCustomer = new Map<string, Override>(
        overrides.map((o: OverrideRow) => [o.customer_id, o as Override]),
      );

      const mapped: CustomerRow[] = customers
        .map((c) => {
          const digits = onlyDigits(c.phone);
          return {
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone || "",
            digits,
            override: ovByCustomer.get(c.id) || null,
          };
        })
        .filter((r) => r.digits.length >= 7);
      setRows(mapped);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load phone coupons";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upsertOverride = async (customerId: string, patch: Partial<Override>) => {
    const existing = rows.find((r) => r.id === customerId)?.override;
    await upsertPhoneCouponOverride(customerId, {
      disabled: patch.disabled ?? existing?.disabled ?? false,
      custom_discount_type: patch.custom_discount_type ?? existing?.custom_discount_type ?? null,
      custom_discount_value: patch.custom_discount_value ?? existing?.custom_discount_value ?? null,
      custom_min_order_amount: patch.custom_min_order_amount ?? existing?.custom_min_order_amount ?? null,
      custom_description: patch.custom_description ?? existing?.custom_description ?? null,
      notes: patch.notes ?? existing?.notes ?? null,
    });
  };


  const handleToggleDisabled = async (row: CustomerRow, disabled: boolean) => {
    try {
      await upsertOverride(row.id, { disabled });
      toast.success(disabled ? "Coupon disabled" : "Coupon enabled");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const openEdit = (row: CustomerRow) => {
    setEditing(row);
    setDraft({
      custom_discount_type: row.override?.custom_discount_type ?? null,
      custom_discount_value: row.override?.custom_discount_value ?? null,
      custom_min_order_amount: row.override?.custom_min_order_amount ?? null,
      custom_description: row.override?.custom_description ?? null,
      notes: row.override?.notes ?? null,
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await upsertOverride(editing.id, draft);
      toast.success("Override saved");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverride = async () => {
    if (!editing || !editing.override) {
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      await deletePhoneCouponOverride(editing.override.id);



      toast.success("Override cleared — defaults restored");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (digits: string, id: string) => {
    try {
      await navigator.clipboard.writeText(digits);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.digits.includes(onlyDigits(search))
    );
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Customer Phone Coupons
          </CardTitle>
          <CardDescription>
            {enabled
              ? "Each customer with a phone number on file has an auto-generated coupon. Edit or disable individual customers below."
              : "Phone-as-coupon is currently disabled. Enable it above to start honoring these codes at checkout."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {rows.length === 0
                ? "No customers with phone numbers yet."
                : "No matching customers."}
            </p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone / Code</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const ov = r.override;
                    const customDiscount =
                      ov?.custom_discount_value != null
                        ? ov.custom_discount_type === "fixed"
                          ? `$${ov.custom_discount_value}`
                          : `${ov.custom_discount_value}%`
                        : null;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.name || "—"}</div>
                          {r.email && (
                            <div className="text-xs text-muted-foreground">{r.email}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {formatPhone(r.digits)}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleCopy(r.digits, r.id)}
                            >
                              {copiedId === r.id ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {customDiscount ? (
                            <Badge variant="secondary">{customDiscount} (custom)</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">Default</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={!ov?.disabled}
                              onCheckedChange={(checked) => handleToggleDisabled(r, !checked)}
                            />
                            <span className="text-xs text-muted-foreground">
                              {ov?.disabled ? "Disabled" : "Active"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                            <Edit2 className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Edit coupon — {editing?.name || formatPhone(editing?.digits || "")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Leave any field blank to fall back to the default phone-coupon settings.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <Select
                  value={draft.custom_discount_type || "default"}
                  onValueChange={(v) =>
                    setDraft({
                      ...draft,
                      custom_discount_type: v === "default" ? null : (v as "percentage" | "fixed"),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use default</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Discount Value</Label>
                <Input
                  type="number"
                  placeholder="Default"
                  value={draft.custom_discount_value ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      custom_discount_value:
                        e.target.value === "" ? null : bankersRound(Number(e.target.value), 2),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Min Order Amount</Label>
                <Input
                  type="number"
                  placeholder="Default"
                  value={draft.custom_min_order_amount ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      custom_min_order_amount:
                        e.target.value === "" ? null : bankersRound(Number(e.target.value), 2),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  placeholder="Default"
                  value={draft.custom_description ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, custom_description: e.target.value || null })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Internal Notes</Label>
              <Input
                placeholder="Why this customer has a custom coupon"
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editing?.override && (
              <Button variant="ghost" onClick={handleClearOverride} disabled={saving}>
                Clear override
              </Button>
            )}
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
