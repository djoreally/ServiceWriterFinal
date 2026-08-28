import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { createExpense, createVendor, updateExpense, uploadReceipt } from "@/application/commands/expenses.command";
import { ReceiptUploadField, type ReceiptUploadStatus } from "@/components/expenses/ReceiptUploadField";
import { AppointmentPicker } from "@/components/expenses/AppointmentPicker";
import {
  fetchExpenseCategories,
  ensureDefaultCategoriesSeeded,
  ensureDefaultVendorsSeeded,
  fetchVendors,
  fetchExpenseLineItems,
  type ExpenseRow,
  type VendorRow,
} from "@/application/queries/expenses.query";
import { useAuth } from "@packages/auth";

interface ManualExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId?: string | null;
  defaultBillable?: boolean;
  onSaved?: () => void;
  expense?: ExpenseRow | null;
}

interface Category { id: string; name: string }

// UI labels mapped to DB-allowed payment_method values (constraint: cash/card/check/ach/other)
const PAYMENT_METHODS: Array<{ label: string; uiValue: string; dbValue: "cash" | "card" | "check" | "ach" | "other" }> = [
  { label: "Cash", uiValue: "cash", dbValue: "cash" },
  { label: "Credit Card", uiValue: "credit_card", dbValue: "card" },
  { label: "Debit Card", uiValue: "debit_card", dbValue: "card" },
  { label: "Check", uiValue: "check", dbValue: "check" },
  { label: "ACH", uiValue: "ach", dbValue: "ach" },
  { label: "Other", uiValue: "other", dbValue: "other" },
];

const toDbPaymentMethod = (uiValue: string): "cash" | "card" | "check" | "ach" | "other" =>
  PAYMENT_METHODS.find((m) => m.uiValue === uiValue)?.dbValue ?? "other";

export function ManualExpenseDialog({ open, onOpenChange, appointmentId, defaultBillable, onSaved, expense }: ManualExpenseDialogProps) {
  const { session } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState(""); // free text fallback / new vendor name
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [creatingVendor, setCreatingVendor] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState<string>("");
  const [subtotal, setSubtotal] = useState<string>("");
  const [tax, setTax] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState<string>("credit_card");
  const [last4, setLast4] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [billable, setBillable] = useState<boolean>(!!defaultBillable);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<ReceiptUploadStatus>("idle");
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<Array<{ description: string; quantity: number; unit_price: number; line_total: number }>>([]);
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string | null>(null);

  // Load reference data when opened
  useEffect(() => {
    if (!open) return;
    (async () => {
      const user = session?.user;
      if (!user) return;
      setUserId(user.id);
      try { await ensureDefaultCategoriesSeeded(user.id); } catch (e) { console.warn(e); }
      try { await ensureDefaultVendorsSeeded(user.id); } catch (e) { console.warn(e); }
      const [{ data: cats }, { data: vens }] = await Promise.all([
        fetchExpenseCategories(user.id),
        fetchVendors(user.id),
      ]);
      setCategories((cats as Category[]) ?? []);
      setVendors((vens as VendorRow[]) ?? []);

      if (expense) {
        setVendorId(expense.vendor_id ?? null);
        setVendorName(expense.vendor_name_raw ?? "");
        setDate(expense.transaction_date);
        setCategoryId(expense.category_id ?? "");
        setSubtotal(String(expense.subtotal ?? ""));
        setTax(String(((Number(expense.tax_amount) / Math.max(Number(expense.subtotal), 0.01)) * 100).toFixed(2)).replace(/\.00$/, ""));
        setPaymentMethod(expense.payment_method === "card" ? "credit_card" : expense.payment_method ?? "other");
        setLast4(expense.last4 ?? "");
        setReference(expense.reference_number ?? "");
        setNotes(expense.notes ?? "");
        setBillable(!!expense.is_billable);
        setLinkedAppointmentId((expense as any).appointment_id ?? null);
        setExistingReceiptUrl(expense.receipt_url ?? null);
        const { data: items } = await fetchExpenseLineItems(expense.id);
        setLineItems(((items as Array<{ description: string; quantity: number; unit_price: number; line_total: number }>) ?? []).map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          line_total: Number(item.line_total),
        })));
      }
    })();
  }, [open, expense]);

  // Reset on close
  useEffect(() => {
    if (open) return;
    setVendorId(null); setVendorName(""); setVendorSearch("");
    setDate(new Date().toISOString().slice(0, 10)); setCategoryId("");
    setSubtotal(""); setTax("0"); setPaymentMethod("credit_card");
    setLast4(""); setReference(""); setNotes(""); setBillable(!!defaultBillable);
    setReceiptFile(null);
    setReceiptStatus("idle");
    setReceiptError(null);
    setExistingReceiptUrl(null);
    setLineItems([]);
    setLinkedAppointmentId(null);
  }, [open, defaultBillable]);  

  // When opening with a parent-provided appointmentId, prefer it as the link target.
  useEffect(() => {
    if (open && appointmentId) setLinkedAppointmentId(appointmentId);
  }, [open, appointmentId]);

  const handleReceiptPick = (file: File | null) => {
    if (!file) {
      setReceiptFile(null);
      setReceiptStatus("idle");
      setReceiptError(null);
      return;
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast({ title: "Unsupported file", description: "Use an image or PDF.", variant: "destructive" });
      return;
    }
    setReceiptFile(file);
    setReceiptStatus("idle");
    setReceiptError(null);
  };

  // Money math in cents to avoid float drift. Tax is a % of subtotal.
  const toCents = (s: string) => Math.round((Number(s) || 0) * 100);
  const subtotalCents = toCents(subtotal);
  const taxRate = Number(tax) || 0; // percent, e.g. 7.25
  const taxCents = Math.round((subtotalCents * taxRate) / 100);
  const totalCents = subtotalCents + taxCents;
  const subtotalNum = subtotalCents / 100;
  const taxNum = taxCents / 100;
  const total = totalCents / 100;

  const filteredVendors = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) => v.name.toLowerCase().includes(q));
  }, [vendors, vendorSearch]);

  const exactMatch = useMemo(
    () => vendors.find((v) => v.name.toLowerCase() === vendorSearch.trim().toLowerCase()),
    [vendors, vendorSearch],
  );
  const showCreateOption = vendorSearch.trim().length > 1 && !exactMatch;

  const selectedVendor = vendorId ? vendors.find((v) => v.id === vendorId) ?? null : null;
  const vendorDisplayLabel = selectedVendor?.name ?? (vendorName || "Select or add a vendor");

  const canSave = (selectedVendor || vendorName.trim().length > 0) && subtotalNum > 0 && date.length === 10;

  const handlePickVendor = (v: VendorRow) => {
    setVendorId(v.id);
    setVendorName(v.name);
    if (v.default_category_id && !categoryId) setCategoryId(v.default_category_id);
    setVendorPickerOpen(false);
    setVendorSearch("");
  };

  const handleCreateVendor = async () => {
    const name = vendorSearch.trim();
    if (!name || !userId) return;
    setCreatingVendor(true);
    try {
      const created = await createVendor({
        user_id: userId,
        name,
        default_category_id: categoryId || null,
      });
      const newVendor: VendorRow = {
        id: created.id,
        name: created.name,
        normalized_name: created.normalized_name,
        default_category_id: created.default_category_id ?? null,
        vendor_type: created.vendor_type ?? null,
        is_active: true,
        times_seen: 0,
      };
      setVendors((prev) => [...prev, newVendor].sort((a, b) => a.name.localeCompare(b.name)));
      handlePickVendor(newVendor);
      toast({ title: "Vendor added", description: name });
    } catch (e: any) {
      toast({ title: "Could not add vendor", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setCreatingVendor(false);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const user = session?.user;
      if (!user) throw new Error("Not signed in");

      const finalVendorName = selectedVendor?.name ?? vendorName.trim();

      let receiptUrl: string | null = null;
      if (receiptFile) {
        setReceiptStatus("uploading");
        setReceiptError(null);
        try {
          receiptUrl = await uploadReceipt(user.id, receiptFile, receiptFile.name);
          setReceiptStatus("uploaded");
        } catch (e: any) {
          setReceiptStatus("failed");
          setReceiptError(e?.message ?? "Upload failed");
          toast({ title: "Receipt upload failed", description: e?.message ?? "Saved without image.", variant: "destructive" });
        }
      }

      const payload = {
        vendor_name_raw: finalVendorName,
        category_id: categoryId || null,
        transaction_date: date,
        subtotal: subtotalNum,
        tax_amount: taxNum,
        total_amount: total,
        payment_method: toDbPaymentMethod(paymentMethod),
        last4: last4 ? last4.slice(-4) : null,
        reference_number: reference || null,
        notes: notes || null,
        receipt_url: receiptUrl ?? existingReceiptUrl,
        is_billable: billable,
        // Always persist the linked appointment so toggling billable off/on doesn't lose the user's selection.
        // The is_billable flag alone determines whether it counts toward job billing.
        appointment_id: linkedAppointmentId,
        line_items: lineItems,
      };

      if (expense) {
        await updateExpense(expense.id, payload, user.id);
      } else {
        await createExpense({
          user_id: user.id,
          submitted_by_user_id: user.id,
          status: "approved",
          ...payload,
        } as any);
      }

      toast({ title: expense ? "Expense updated" : "Expense recorded", description: `$${total.toFixed(2)} to ${finalVendorName}` });
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
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[92dvh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-3 border-b border-border/60 shrink-0">
          <DialogTitle>{expense ? "Edit Expense" : "Manual Entry"}</DialogTitle>
          <DialogDescription>{expense ? "Update an existing expense entry." : "Record an expense without scanning a receipt."}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Vendor</Label>
              <Popover open={vendorPickerOpen} onOpenChange={setVendorPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={vendorPickerOpen}
                    className={cn(
                      "w-full justify-between font-normal",
                      !selectedVendor && !vendorName && "text-muted-foreground",
                    )}
                  >
                    <span className="truncate">{vendorDisplayLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search or add new vendor..."
                      value={vendorSearch}
                      onValueChange={setVendorSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {vendorSearch.trim() ? "No matching vendor." : "Start typing to search."}
                      </CommandEmpty>
                      {filteredVendors.length > 0 && (
                        <CommandGroup heading="Saved vendors">
                          {filteredVendors.map((v) => (
                            <CommandItem
                              key={v.id}
                              value={v.id}
                              onSelect={() => handlePickVendor(v)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  vendorId === v.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span className="truncate">{v.name}</span>
                              {v.vendor_type && (
                                <span className="ml-auto text-xs text-muted-foreground capitalize">
                                  {v.vendor_type}
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      {showCreateOption && (
                        <>
                          <CommandSeparator />
                          <CommandGroup>
                            <CommandItem
                              value={`__create__${vendorSearch}`}
                              onSelect={handleCreateVendor}
                              disabled={creatingVendor}
                            >
                              {creatingVendor ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="mr-2 h-4 w-4" />
                              )}
                              Add "{vendorSearch.trim()}" as new vendor
                            </CommandItem>
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {!selectedVendor && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Pick a saved vendor or type a new name to add it.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id="category"><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="subtotal">Subtotal</Label>
              <Input id="subtotal" type="number" step="0.01" inputMode="decimal" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label htmlFor="tax">Tax %</Label>
              <Input id="tax" type="number" step="0.01" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0.00" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Enter the rate, not the amount — e.g. <span className="font-medium">7.25</span> for 7.25%.
              </p>
            </div>
            <div>
              <Label htmlFor="payment">Payment</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.uiValue} value={m.uiValue}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="last4">Card last 4</Label>
              <Input id="last4" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} placeholder="1234" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ref">Reference / Invoice #</Label>
              <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>

            {/* Receipt upload (shared component) */}
            <div className="sm:col-span-2">
              <ReceiptUploadField
                file={receiptFile}
                onFileChange={handleReceiptPick}
                status={receiptStatus}
                errorMessage={receiptError}
                label="Receipt"
                optional
                disabled={saving}
                helperText="Attach a photo or PDF — we'll link it to this expense."
              />
              {!receiptFile && existingReceiptUrl && (
                <p className="text-[11px] text-muted-foreground mt-1">Current receipt attached. Upload a new file to replace it.</p>
              )}
            </div>

            {lineItems.length > 0 && (
              <div className="sm:col-span-2 space-y-1 border-t pt-2">
                <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Line items</p>
                <div className="space-y-1 text-xs">
                  {lineItems.map((li, i) => (
                    <div key={`${li.description}-${i}`} className="grid grid-cols-12 gap-2 items-center">
                      <Input className="col-span-6 h-8 text-xs" value={li.description} onChange={(e) => setLineItems(lineItems.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                      <Input className="col-span-2 h-8 text-xs" type="number" step="0.01" value={li.quantity} onChange={(e) => setLineItems(lineItems.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} />
                      <Input className="col-span-2 h-8 text-xs" type="number" step="0.01" value={li.unit_price} onChange={(e) => setLineItems(lineItems.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) } : x))} />
                      <Input className="col-span-2 h-8 text-xs" type="number" step="0.01" value={li.line_total} onChange={(e) => setLineItems(lineItems.map((x, j) => j === i ? { ...x, line_total: Number(e.target.value) } : x))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="sm:col-span-2 space-y-2 rounded-md border border-border px-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="billable" className="cursor-pointer">Billable to job</Label>
                  <p className="text-xs text-muted-foreground">Bill this back on the linked appointment.</p>
                </div>
                <Switch id="billable" checked={billable} onCheckedChange={setBillable} />
              </div>
              {billable && (
                <div className="space-y-1 pt-1 border-t border-border/60">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Linked appointment
                  </Label>
                  <AppointmentPicker
                    value={linkedAppointmentId}
                    onChange={(id) => setLinkedAppointmentId(id)}
                    disabled={!!appointmentId}
                    placeholder="Search and select an appointment…"
                  />
                  {appointmentId && (
                    <p className="text-[11px] text-muted-foreground">
                      Locked to the appointment this expense was opened from.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">${subtotalNum.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tax ({taxRate.toFixed(2)}%)</span>
              <span className="tabular-nums">${taxNum.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Total</span>
              <span className="text-xl font-black tabular-nums">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 sm:px-6 py-3 border-t border-border/60 shrink-0 bg-background flex-col-reverse sm:flex-row gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving} className="gap-2 w-full sm:w-auto">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {expense ? "Save Changes" : "Save Expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
