import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@packages/auth";
import {
  fetchExpenseCategories,
  fetchVendors,
  ensureDefaultCategoriesSeeded,
  type VendorRow,
} from "@/application/queries/expenses.query";
import {
  createRecurringExpense,
  updateRecurringExpense,
  type RecurringExpenseInput,
} from "@/application/commands/recurring-expenses.command";
import type { RecurringExpenseRow } from "@/application/queries/recurring-expenses.query";
import { RECURRING_TEMPLATE_GROUPS, type RecurringTemplate } from "./recurringTemplates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: RecurringExpenseRow | null;
  onSaved?: () => void;
}

interface Category { id: string; name: string }

const FREQUENCIES: Array<{ value: RecurringExpenseInput["frequency"]; label: string }> = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const PAYMENT_METHODS = [
  { value: "card", label: "Card" },
  { value: "ach", label: "ACH / Bank Transfer" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "other", label: "Other" },
] as const;

export function RecurringExpenseDialog({ open, onOpenChange, existing, onSaved }: Props) {
  const { session } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [frequency, setFrequency] = useState<RecurringExpenseInput["frequency"]>("monthly");
  const [dayOfMonth, setDayOfMonth] = useState<string>("1");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("card");
  const [notes, setNotes] = useState("");
  const [autopost, setAutopost] = useState(true);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const user = session?.user;
      if (!user) return;
      setUserId(user.id);
      try { await ensureDefaultCategoriesSeeded(user.id); } catch { /* ignore */ }
      const [{ data: cats }, { data: vens }] = await Promise.all([
        fetchExpenseCategories(user.id),
        fetchVendors(user.id),
      ]);
      setCategories((cats as Category[]) ?? []);
      setVendors((vens as VendorRow[]) ?? []);

      if (existing) {
        setName(existing.name);
        setVendorName(existing.vendor_name);
        setVendorId(existing.vendor_id);
        setCategoryId(existing.category_id ?? "");
        setAmount(String(existing.amount));
        setFrequency(existing.frequency);
        setDayOfMonth(String(existing.day_of_month ?? 1));
        setStartDate(existing.start_date);
        setEndDate(existing.end_date ?? "");
        setPaymentMethod(existing.payment_method ?? "card");
        setNotes(existing.notes ?? "");
        setAutopost(existing.autopost);
      }
    })();
  }, [open, existing]);

  useEffect(() => {
    if (open) return;
    setName(""); setVendorName(""); setVendorId(null); setCategoryId("");
    setAmount(""); setFrequency("monthly"); setDayOfMonth("1");
    setStartDate(new Date().toISOString().slice(0, 10)); setEndDate("");
    setPaymentMethod("card"); setNotes(""); setAutopost(true);
  }, [open]);

  const computedNextDue = useMemo(() => {
    // Next due = startDate if in the future, otherwise the next occurrence based on frequency
    return startDate;
  }, [startDate]);

  const applyTemplate = (t: RecurringTemplate) => {
    setName(t.name);
    setVendorName(t.vendor_name);
    setAmount(String(t.amount));
    setFrequency(t.frequency);
    if (t.notes) setNotes(t.notes);
    // Try to match category
    const matched = categories.find((c) => c.name.toLowerCase() === t.category_hint.toLowerCase());
    if (matched) setCategoryId(matched.id);
  };

  const canSave = name.trim().length > 0 && vendorName.trim().length > 0 && Number(amount) > 0;

  const handleSave = async () => {
    if (!canSave || !userId) return;
    setSaving(true);
    try {
      const payload: RecurringExpenseInput = {
        name: name.trim(),
        vendor_id: vendorId,
        vendor_name: vendorName.trim(),
        category_id: categoryId || null,
        amount: Number(amount),
        frequency,
        interval_count: 1,
        day_of_month: dayOfMonth ? Number(dayOfMonth) : null,
        start_date: startDate,
        end_date: endDate || null,
        next_due_date: existing?.next_due_date ?? computedNextDue,
        payment_method: paymentMethod as RecurringExpenseInput["payment_method"],
        notes: notes || null,
        autopost,
        is_active: true,
      };
      if (existing) {
        await updateRecurringExpense(existing.id, payload);
        toast({ title: "Recurring expense updated", description: payload.name });
      } else {
        await createRecurringExpense(userId, payload);
        toast({ title: "Recurring expense added", description: payload.name });
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[92dvh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
          <DialogTitle>{existing ? "Edit Recurring Expense" : "New Recurring Expense"}</DialogTitle>
          <DialogDescription>
            Set a recurring template — the app will auto-generate ledger entries on each due date.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-[1fr_240px]">
          <div className="px-5 sm:px-6 py-4 space-y-4 border-r border-border/60">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="rec-name">Name</Label>
                <Input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Van Payment" />
              </div>
              <div>
                <Label htmlFor="rec-vendor">Vendor</Label>
                <Input
                  id="rec-vendor"
                  value={vendorName}
                  onChange={(e) => { setVendorName(e.target.value); setVendorId(null); }}
                  placeholder="Vendor name"
                  list="rec-vendor-list"
                />
                <datalist id="rec-vendor-list">
                  {vendors.map((v) => <option key={v.id} value={v.name} />)}
                </datalist>
              </div>
              <div>
                <Label htmlFor="rec-cat">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="rec-cat"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rec-amount">Amount</Label>
                <Input id="rec-amount" type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label htmlFor="rec-freq">Frequency</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as RecurringExpenseInput["frequency"])}>
                  <SelectTrigger id="rec-freq"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="rec-start">Start Date</Label>
                <Input id="rec-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="rec-end">End Date (optional)</Label>
                <Input id="rec-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="rec-pay">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="rec-pay"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <div>
                  <Label className="text-sm">Auto-post each cycle</Label>
                  <p className="text-[11px] text-muted-foreground">
                    When enabled, an approved expense is auto-created each time this recurs.
                  </p>
                </div>
                <Switch checked={autopost} onCheckedChange={setAutopost} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="rec-notes">Notes</Label>
                <Textarea id="rec-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" rows={2} />
              </div>
            </div>
          </div>

          <div className="px-4 py-4 bg-muted/30 space-y-3 overflow-y-auto max-h-[80dvh]">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <p className="text-[11px] font-bold uppercase tracking-wider">Quick Templates</p>
            </div>
            {RECURRING_TEMPLATE_GROUPS.map((g) => (
              <div key={g.group} className="space-y-1">
                <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">{g.group}</p>
                <div className="space-y-1">
                  {g.items.map((t) => (
                    <button
                      type="button"
                      key={t.name}
                      onClick={() => applyTemplate(t)}
                      className="w-full text-left text-xs rounded-md border border-border/60 bg-background px-2 py-1.5 hover:border-primary hover:bg-primary/5 transition"
                    >
                      <div className="font-medium truncate">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-2">
                        <span className="truncate">${t.amount} · {t.frequency}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="px-5 sm:px-6 py-3 border-t border-border/60 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {existing ? "Save Changes" : "Add Recurring Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
