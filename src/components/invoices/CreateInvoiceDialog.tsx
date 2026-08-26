import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Plus,
  Trash2,
  Car,
  Users,
  Building2,
  Search,
  Wand2,
  Droplet,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { useAuth } from "@packages/auth";
import {
  fetchInvoiceFormOptions,
  generateInvoiceNumber,
  fetchInvoiceDetail,
  type InvoiceCustomerOption,
  type InvoiceFleetClient,
  type InvoiceServiceCatalogOption,
  type InvoiceFeeDefaults,
} from "@/application/queries/invoices.query";
import {
  createInvoice,
  updateInvoice,
  computeInvoiceTotals,
  type InvoiceLineItemInput,
} from "@/application/commands/invoices.command";
import { createCustomerAndReturn } from "@/application/commands/customers.command";
import {
  decodeVinFromNhtsa,
  isValidVinFormat,
  normalizeVin,
} from "@/features/vehicle-import/nhtsa.service";
import { decodeVinNumber } from "@/application/commands/vin.command";

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (invoiceId: string) => void;
  /** When set, dialog edits this invoice instead of creating a new one. */
  invoiceId?: string | null;
}

type DecodeStatus = "idle" | "decoding" | "decoded" | "error";

interface VehicleBlock {
  uid: string;
  vin: string;
  status: DecodeStatus;
  errorMessage?: string;
  // decoded
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engine?: string | null;
  // oil specs
  oil_type?: string | null;
  oil_capacity?: string | null;
  oil_filter?: string | null;
  // line items for this vehicle
  lines: DraftLine[];
}

interface DraftLine extends InvoiceLineItemInput {
  uid: string;
}

const CUSTOM_DESC = "__custom__";

function makeUid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newLine(displayOrder: number): DraftLine {
  return {
    uid: makeUid(),
    vehicle_id: null,
    service_catalog_id: null,
    description: "",
    quantity: 1,
    unit_price: 0,
    display_order: displayOrder,
  };
}

function newVehicleBlock(vin = ""): VehicleBlock {
  return {
    uid: makeUid(),
    vin: vin.toUpperCase(),
    status: "idle",
    lines: [newLine(0)],
  };
}

/** Extract candidate VINs from a free-text paste */
function extractVins(text: string): string[] {
  const tokens = text
    .split(/[\s,;\n\r\t]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (isValidVinFormat(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function CreateInvoiceDialog({ open, onOpenChange, onSuccess, invoiceId }: CreateInvoiceDialogProps) {
  const isEdit = !!invoiceId;
  const { formatCurrency } = useRegionalSettings();
  const { session } = useAuth();

  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const [customers, setCustomers] = useState<InvoiceCustomerOption[]>([]);
  const [fleetClients, setFleetClients] = useState<InvoiceFleetClient[]>([]);
  const [catalog, setCatalog] = useState<InvoiceServiceCatalogOption[]>([]);
  const [fees, setFees] = useState<InvoiceFeeDefaults | null>(null);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [billToType, setBillToType] = useState<"retail" | "fleet">("retail");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [fleetClientId, setFleetClientId] = useState<string | null>(null);
  const [issueDate, setIssueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [notes, setNotes] = useState("");

  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [wasteEnabled, setWasteEnabled] = useState(false);
  const [wasteFee, setWasteFee] = useState("0");
  const [shopFeeEnabled, setShopFeeEnabled] = useState(false);
  const [shopFee, setShopFee] = useState("0");
  const [surchargeEnabled, setSurchargeEnabled] = useState(false);
  const [surcharge, setSurcharge] = useState("0");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [discountAmount, setDiscountAmount] = useState("0");

  const [vehicles, setVehicles] = useState<VehicleBlock[]>([]);
  const [bulkPaste, setBulkPaste] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // Inline "+ New Customer" support, so users can create a customer without
  // leaving the invoice they are building.
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const handleCreateInlineCustomer = async () => {
    const name = newCustomerName.trim();
    if (!name) {
      toast.error("Customer name is required");
      return;
    }
    setCreatingCustomer(true);
    try {
      const created = await createCustomerAndReturn({
        name,
        email: newCustomerEmail.trim() || null,
        phone: newCustomerPhone.trim() || null,
        address: null,
        notes: null,
      });
      const option: InvoiceCustomerOption = {
        id: created.id,
        name: created.name,
        email: created.email,
        phone: created.phone,
      } as InvoiceCustomerOption;
      setCustomers((prev) => [option, ...prev]);
      setCustomerId(created.id);
      setNewCustomerOpen(false);
      setNewCustomerName("");
      setNewCustomerEmail("");
      setNewCustomerPhone("");
      toast.success("Customer created and selected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setCreatingCustomer(false);
    }
  };


  const reset = useCallback(() => {
    setInvoiceNumber("");
    setBillToType("retail");
    setCustomerId(null);
    setFleetClientId(null);
    setIssueDate(format(new Date(), "yyyy-MM-dd"));
    setDueDate("");
    setPaymentTerms("Net 30");
    setNotes("");
    setTaxEnabled(false);
    setTaxRate("0");
    setWasteEnabled(false);
    setWasteFee("0");
    setShopFeeEnabled(false);
    setShopFee("0");
    setSurchargeEnabled(false);
    setSurcharge("0");
    setDiscountType("fixed");
    setDiscountAmount("0");
    setVehicles([]);
    setBulkPaste("");
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setBootstrapping(true);
      try {
        const user = session?.user;
        if (!user) {
          toast.error("Not authenticated");
          return;
        }
        const [opts, num, existing] = await Promise.all([
          fetchInvoiceFormOptions(user.id),
          isEdit ? Promise.resolve("") : generateInvoiceNumber(user.id),
          isEdit && invoiceId ? fetchInvoiceDetail(invoiceId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCustomers(opts.customers);
        setFleetClients(opts.fleetClients);
        setCatalog(opts.catalog);
        setFees(opts.fees);

        if (existing) {
          setInvoiceNumber(existing.invoice_number);
          setBillToType(existing.bill_to_type);
          setCustomerId(existing.customer_id);
          setFleetClientId(existing.fleet_client_id);
          setIssueDate(existing.issue_date);
          setDueDate(existing.due_date ?? "");
          setPaymentTerms(existing.payment_terms ?? "");
          setNotes(existing.notes ?? "");
          setTaxEnabled(!!existing.tax_enabled);
          setTaxRate(String(existing.tax_rate ?? 0));
          setWasteEnabled(!!existing.waste_oil_fee_enabled);
          setWasteFee(String(existing.waste_oil_fee ?? 0));
          setShopFeeEnabled(!!existing.shop_fee_enabled);
          setShopFee(String(existing.shop_fee ?? 0));
          setSurchargeEnabled(!!existing.surcharge_enabled);
          setSurcharge(String(existing.surcharge ?? 0));
          setDiscountType((existing.discount_type ?? "fixed") as "fixed" | "percentage");
          setDiscountAmount(String(existing.discount_amount ?? 0));

          // Group line items into vehicle blocks by VIN
          const groups = new Map<string, VehicleBlock>();
          for (const li of existing.invoice_line_items) {
            const key = (li.vin || `__nov_${groups.size}`).toUpperCase();
            let block = groups.get(key);
            if (!block) {
              block = {
                uid: makeUid(),
                vin: li.vin ? li.vin.toUpperCase() : "",
                status: li.vin ? "decoded" : "idle",
                year: li.vehicle_year,
                make: li.vehicle_make,
                model: li.vehicle_model,
                trim: li.vehicle_trim,
                engine: li.vehicle_engine,
                oil_type: li.oil_type,
                oil_capacity: li.oil_capacity,
                oil_filter: li.oil_filter,
                lines: [],
              };
              groups.set(key, block);
            }
            block.lines.push({
              uid: makeUid(),
              vehicle_id: li.vehicle_id,
              service_catalog_id: li.service_catalog_id,
              description: li.description,
              quantity: Number(li.quantity) || 0,
              unit_price: Number(li.unit_price) || 0,
              display_order: li.display_order ?? 0,
            });
          }
          setVehicles(Array.from(groups.values()));
        } else {
          setInvoiceNumber(num);
          if (opts.fees) {
            setWasteFee(String(opts.fees.waste_oil_fee ?? 0));
            setShopFee(String(opts.fees.shop_fee_value ?? 0));
            setSurcharge(String(opts.fees.surcharge_value ?? 0));
            setTaxRate(String(opts.fees.tax_rate ?? 0));
          }
          setVehicles([newVehicleBlock()]);
        }
      } catch (err) {
        console.error("[CreateInvoiceDialog] bootstrap failed", err);
        toast.error("Failed to load invoice form");
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, invoiceId]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // Flatten lines for total computation, attaching vehicle context
  const flatLines = useMemo<InvoiceLineItemInput[]>(() => {
    let order = 0;
    const out: InvoiceLineItemInput[] = [];
    for (const v of vehicles) {
      for (const l of v.lines) {
        out.push({
          ...l,
          display_order: order++,
          vin: v.vin || null,
          vehicle_year: v.year ?? null,
          vehicle_make: v.make ?? null,
          vehicle_model: v.model ?? null,
          vehicle_trim: v.trim ?? null,
          vehicle_engine: v.engine ?? null,
          oil_type: v.oil_type ?? null,
          oil_capacity: v.oil_capacity ?? null,
          oil_filter: v.oil_filter ?? null,
        });
      }
    }
    return out;
  }, [vehicles]);

  const totals = useMemo(
    () =>
      computeInvoiceTotals({
        line_items: flatLines,
        discount_type: discountType,
        discount_amount: Number(discountAmount) || 0,
        tax_enabled: taxEnabled,
        tax_rate: Number(taxRate) || 0,
        waste_oil_fee_enabled: wasteEnabled,
        waste_oil_fee: Number(wasteFee) || 0,
        shop_fee_enabled: shopFeeEnabled,
        shop_fee: Number(shopFee) || 0,
        surcharge_enabled: surchargeEnabled,
        surcharge: Number(surcharge) || 0,
      }),
    [
      flatLines,
      discountType,
      discountAmount,
      taxEnabled,
      taxRate,
      wasteEnabled,
      wasteFee,
      shopFeeEnabled,
      shopFee,
      surchargeEnabled,
      surcharge,
    ],
  );

  const updateVehicle = (uid: string, patch: Partial<VehicleBlock>) => {
    setVehicles((prev) => prev.map((v) => (v.uid === uid ? { ...v, ...patch } : v)));
  };

  const removeVehicle = (uid: string) => {
    setVehicles((prev) => prev.filter((v) => v.uid !== uid));
  };

  const addLineToVehicle = (uid: string) => {
    setVehicles((prev) =>
      prev.map((v) =>
        v.uid === uid ? { ...v, lines: [...v.lines, newLine(v.lines.length)] } : v,
      ),
    );
  };

  const removeLineFromVehicle = (vUid: string, lUid: string) => {
    setVehicles((prev) =>
      prev.map((v) => (v.uid === vUid ? { ...v, lines: v.lines.filter((l) => l.uid !== lUid) } : v)),
    );
  };

  const updateLine = (vUid: string, lUid: string, patch: Partial<DraftLine>) => {
    setVehicles((prev) =>
      prev.map((v) =>
        v.uid === vUid
          ? { ...v, lines: v.lines.map((l) => (l.uid === lUid ? { ...l, ...patch } : l)) }
          : v,
      ),
    );
  };

  const handleCatalogPick = (vUid: string, lUid: string, catalogId: string) => {
    if (catalogId === CUSTOM_DESC) {
      updateLine(vUid, lUid, { service_catalog_id: null });
      return;
    }
    const item = catalog.find((c) => c.id === catalogId);
    if (!item) return;
    updateLine(vUid, lUid, {
      service_catalog_id: item.id,
      description: item.name,
      unit_price: Number(item.default_price) || 0,
    });
  };

  /** Decode a VIN: NHTSA for vehicle, then vin-decode edge for oil specs (best-effort) */
  const decodeVehicle = useCallback(async (uid: string, vinRaw: string) => {
    const vin = normalizeVin(vinRaw);
    if (!isValidVinFormat(vin)) {
      updateVehicle(uid, { status: "error", errorMessage: "Invalid VIN format (17 chars)" });
      return;
    }
    updateVehicle(uid, { status: "decoding", errorMessage: undefined, vin });

    const nhtsa = await decodeVinFromNhtsa(vin);
    if (nhtsa.status === "failed" || nhtsa.status === "invalid_vin") {
      updateVehicle(uid, {
        status: "error",
        errorMessage: nhtsa.errorMessage || "NHTSA could not decode this VIN",
      });
      return;
    }

    const p = nhtsa.profile ?? {};
    const patch: Partial<VehicleBlock> = {
      status: "decoded",
      vin,
      year: p.year ?? null,
      make: p.make ?? null,
      model: p.model ?? null,
      trim: p.trim ?? null,
      engine: p.engine ?? null,
    };

    // Best-effort oil specs via internal vin-decode edge function
    try {
      const decoded = await decodeVinNumber(vin);
      if (decoded?.oilSpecs) {
        patch.oil_type = decoded.oilSpecs.oilType ?? null;
        patch.oil_capacity = decoded.oilSpecs.oilCapacity ?? null;
        patch.oil_filter = decoded.oilSpecs.oilFilter ?? null;
      }
    } catch (err) {
      // Non-fatal: oil specs are optional
      console.warn("[invoice] oil spec lookup failed", err);
    }

    updateVehicle(uid, patch);
  }, []);

  const handleBulkPaste = async () => {
    const vins = extractVins(bulkPaste);
    if (vins.length === 0) {
      toast.error("No valid 17-character VINs found in the paste");
      return;
    }
    setBulkBusy(true);
    try {
      // Build new blocks (preserve existing ones that already have a VIN; replace empty trailing block)
      const blocks: VehicleBlock[] = vins.map((vin) => newVehicleBlock(vin));
      setVehicles((prev) => {
        const trimmed = prev.filter((v) => v.vin.trim() !== "" || v.lines.some((l) => l.description));
        return [...trimmed, ...blocks];
      });
      // Decode in parallel (capped concurrency by Promise.all over small N)
      await Promise.all(blocks.map((b) => decodeVehicle(b.uid, b.vin)));
      setBulkPaste("");
      toast.success(`Added ${vins.length} vehicle${vins.length > 1 ? "s" : ""}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (billToType === "retail" && !customerId) {
      toast.error("Select a customer");
      return;
    }
    if (billToType === "fleet" && !fleetClientId) {
      toast.error("Select a fleet client");
      return;
    }
    if (flatLines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    const invalid = flatLines.find(
      (l) => !l.description.trim() || !(Number(l.quantity) > 0),
    );
    if (invalid) {
      toast.error("Each line needs a description and a quantity > 0");
      return;
    }

    setLoading(true);
    try {
      const payload: import("@/application/commands/invoices.command").CreateInvoiceInput = {
        invoice_number: invoiceNumber,
        bill_to_type: billToType,
        customer_id: billToType === "retail" ? customerId : null,
        fleet_client_id: billToType === "fleet" ? fleetClientId : null,
        contact_name: null,
        contact_email: null,
        contact_phone: null,
        issue_date: issueDate,
        due_date: dueDate || null,
        payment_terms: paymentTerms || null,
        notes: notes || null,
        terms_text: null,
        discount_type: discountType,
        discount_amount: Number(discountAmount) || 0,
        tax_enabled: taxEnabled,
        tax_rate: Number(taxRate) || 0,
        waste_oil_fee_enabled: wasteEnabled,
        waste_oil_fee: Number(wasteFee) || 0,
        shop_fee_enabled: shopFeeEnabled,
        shop_fee: Number(shopFee) || 0,
        surcharge_enabled: surchargeEnabled,
        surcharge: Number(surcharge) || 0,
        line_items: flatLines.map(({ uid: _u, ...rest }: any) => rest),
      };
      let id = invoiceId ?? "";
      if (isEdit && invoiceId) {
        await updateInvoice(invoiceId, payload);
        toast.success("Invoice updated");
      } else {
        id = await createInvoice(payload);
        toast.success("Invoice created");
      }
      onOpenChange(false);
      onSuccess?.(id);
    } catch (err) {
      console.error("[CreateInvoiceDialog] submit failed", err);
      const msg = err instanceof Error ? err.message : "Failed to save invoice";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const renderLineRow = (vUid: string, line: DraftLine) => (
    <div key={line.uid} className="grid grid-cols-12 gap-2 items-start py-2">
      <div className="col-span-12 md:col-span-5 space-y-1">
        <Select
          value={line.service_catalog_id ?? CUSTOM_DESC}
          onValueChange={(v) => handleCatalogPick(vUid, line.uid, v)}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Pick a service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CUSTOM_DESC}>Custom description</SelectItem>
            {catalog.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} — {formatCurrency(Number(c.default_price) || 0)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={line.description}
          onChange={(e) => updateLine(vUid, line.uid, { description: e.target.value })}
          placeholder="Service description (e.g. parts, labor, notes)"
          className="min-h-[60px] text-sm"
          rows={2}
        />
      </div>
      <div className="col-span-4 md:col-span-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.quantity}
          onChange={(e) => updateLine(vUid, line.uid, { quantity: Number(e.target.value) || 0 })}
          placeholder="Qty"
          className="h-9"
        />
      </div>
      <div className="col-span-4 md:col-span-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={line.unit_price}
          onChange={(e) => updateLine(vUid, line.uid, { unit_price: Number(e.target.value) || 0 })}
          placeholder="Unit price"
          className="h-9"
        />
      </div>
      <div className="col-span-3 md:col-span-2 text-right pt-2 text-sm font-medium">
        {formatCurrency((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}
      </div>
      <div className="col-span-1 flex justify-end pt-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => removeLineFromVehicle(vUid, line.uid)}
          className="h-8 w-8"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{isEdit ? "Edit Invoice" : "Create Invoice"}</span>
            {invoiceNumber && (
              <Badge variant="outline" className="font-mono">
                {invoiceNumber}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {bootstrapping ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Bill-to selector */}
            <section className="space-y-3">
              <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Bill To
              </Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={billToType === "retail" ? "default" : "outline"}
                  onClick={() => {
                    setBillToType("retail");
                    setFleetClientId(null);
                  }}
                  className="gap-2"
                >
                  <Users className="h-4 w-4" /> Retail Customer
                </Button>
                <Button
                  type="button"
                  variant={billToType === "fleet" ? "default" : "outline"}
                  onClick={() => {
                    setBillToType("fleet");
                    setCustomerId(null);
                  }}
                  className="gap-2"
                >
                  <Building2 className="h-4 w-4" /> Fleet Client
                </Button>
              </div>

              {billToType === "retail" ? (
                <div className="flex items-stretch gap-2">
                  <Select value={customerId ?? ""} onValueChange={(v) => setCustomerId(v || null)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.length === 0 && (
                        <div className="px-2 py-3 text-sm text-muted-foreground">
                          No customers yet — use “+ New” to add one.
                        </div>
                      )}
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.email ? `· ${c.email}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setNewCustomerOpen(true)}
                    className="gap-1 shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </Button>
                </div>
              ) : (
                <Select
                  value={fleetClientId ?? ""}
                  onValueChange={(v) => setFleetClientId(v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a fleet client" />
                  </SelectTrigger>
                  <SelectContent>
                    {fleetClients.length === 0 && (
                      <div className="px-2 py-3 text-sm text-muted-foreground">
                        No fleet clients yet.
                      </div>
                    )}
                    {fleetClients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </section>

            {/* Dates */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Issue Date</Label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Payment Terms</Label>
                <Input
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="Net 30"
                />
              </div>
            </section>

            <Separator />

            {/* Bulk VIN paste */}
            <section className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-bold">Bulk add by VIN</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste one or many VINs (any separator: spaces, commas, line breaks). Each VIN will become its own line group, decoded via NHTSA.
              </p>
              <div className="flex gap-2">
                <Textarea
                  value={bulkPaste}
                  onChange={(e) => setBulkPaste(e.target.value)}
                  placeholder="1HGCM82633A004352, 5YJ3E1EA7JF006789..."
                  rows={2}
                  className="font-mono text-xs"
                />
                <Button onClick={handleBulkPaste} disabled={bulkBusy || !bulkPaste.trim()} className="self-stretch">
                  {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decode & Add"}
                </Button>
              </div>
            </section>

            {/* Vehicles + lines */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Vehicles & Services
                </Label>
                <Button size="sm" variant="outline" onClick={() => setVehicles((p) => [...p, newVehicleBlock()])} className="gap-2">
                  <Plus className="h-4 w-4" /> Add Vehicle
                </Button>
              </div>

              {vehicles.map((v) => (
                <Card key={v.uid}>
                  <CardContent className="p-4 space-y-3">
                    {/* VIN row */}
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[260px] space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <Car className="h-3.5 w-3.5" /> VIN
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            value={v.vin}
                            onChange={(e) => updateVehicle(v.uid, { vin: e.target.value.toUpperCase(), status: "idle" })}
                            placeholder="17-character VIN"
                            maxLength={17}
                            className="font-mono uppercase"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => decodeVehicle(v.uid, v.vin)}
                            disabled={v.status === "decoding" || !v.vin}
                            className="gap-1"
                          >
                            {v.status === "decoding" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Search className="h-4 w-4" />
                            )}
                            Decode
                          </Button>
                        </div>
                        {v.status === "error" && (
                          <p className="text-xs text-destructive">{v.errorMessage}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeVehicle(v.uid)}
                        className="h-9 w-9"
                        title="Remove vehicle"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Decoded vehicle summary */}
                    {v.status === "decoded" && (
                      <div className="rounded-md bg-muted/40 p-3 space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {v.year && <Badge variant="secondary">{v.year}</Badge>}
                          {v.make && <Badge variant="secondary">{v.make}</Badge>}
                          {v.model && <Badge variant="secondary">{v.model}</Badge>}
                          {v.trim && <Badge variant="outline">{v.trim}</Badge>}
                          {v.engine && <Badge variant="outline">{v.engine}</Badge>}
                        </div>
                        {(v.oil_type || v.oil_capacity || v.oil_filter) && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Droplet className="h-3.5 w-3.5" />
                            <span className="font-medium">Oil:</span>
                            {v.oil_type && <span>{v.oil_type}</span>}
                            {v.oil_capacity && <span>· {v.oil_capacity}</span>}
                            {v.oil_filter && <span>· Filter {v.oil_filter}</span>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lines */}
                    <div className="space-y-1">
                      <div className="hidden md:grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold pt-2 border-t">
                        <div className="col-span-5">Service / Description</div>
                        <div className="col-span-2">Qty</div>
                        <div className="col-span-2">Unit Price</div>
                        <div className="col-span-2 text-right">Total</div>
                        <div className="col-span-1" />
                      </div>
                      {v.lines.map((l) => renderLineRow(v.uid, l))}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => addLineToVehicle(v.uid)}
                        className="gap-1 h-7 mt-1"
                      >
                        <Plus className="h-3 w-3" /> Add Service Line
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {vehicles.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-6 border border-dashed rounded-md">
                  No vehicles yet. Add a VIN above or click <span className="font-bold">Add Vehicle</span>.
                </div>
              )}
            </section>

            <Separator />

            {/* Fees & Tax */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Fees & Surcharges
                </Label>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={wasteEnabled} onCheckedChange={setWasteEnabled} />
                    <Label className="cursor-pointer">Waste Oil Fee</Label>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={wasteFee}
                    onChange={(e) => setWasteFee(e.target.value)}
                    disabled={!wasteEnabled}
                    className="w-28 h-8"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={shopFeeEnabled} onCheckedChange={setShopFeeEnabled} />
                    <Label className="cursor-pointer">Shop Fee</Label>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shopFee}
                    onChange={(e) => setShopFee(e.target.value)}
                    disabled={!shopFeeEnabled}
                    className="w-28 h-8"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={surchargeEnabled} onCheckedChange={setSurchargeEnabled} />
                    <Label className="cursor-pointer">Surcharge</Label>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={surcharge}
                    onChange={(e) => setSurcharge(e.target.value)}
                    disabled={!surchargeEnabled}
                    className="w-28 h-8"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={taxEnabled} onCheckedChange={setTaxEnabled} />
                    <Label className="cursor-pointer">Sales Tax</Label>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.001"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      disabled={!taxEnabled}
                      className="w-24 h-8"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Discount
                </Label>
                <div className="flex gap-2">
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as "fixed" | "percentage")}>
                    <SelectTrigger className="w-32 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed ($)</SelectItem>
                      <SelectItem value="percentage">Percent (%)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="h-9"
                  />
                </div>
                <Label className="pt-3 text-sm font-bold uppercase tracking-wider text-muted-foreground block">
                  Notes
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes or message for the customer"
                  rows={3}
                />
              </div>
            </section>

            <Separator />

            {/* Totals summary */}
            <section className="bg-muted/40 rounded-lg p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
              </div>
              {totals.effective_discount > 0 && (
                <div className="flex justify-between text-primary">
                  <span>Discount</span>
                  <span>−{formatCurrency(totals.effective_discount)}</span>
                </div>
              )}
              {taxEnabled && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax ({taxRate}%)</span>
                  <span className="font-medium">{formatCurrency(totals.tax_amount)}</span>
                </div>
              )}
              <Separator className="my-2" />
              <div className="flex justify-between text-lg font-black">
                <span>Total</span>
                <span>{formatCurrency(totals.total)}</span>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || bootstrapping}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-cust-name">Name *</Label>
            <Input
              id="new-cust-name"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              placeholder="Full name"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-cust-email">Email</Label>
            <Input
              id="new-cust-email"
              type="email"
              value={newCustomerEmail}
              onChange={(e) => setNewCustomerEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-cust-phone">Phone</Label>
            <Input
              id="new-cust-phone"
              type="tel"
              value={newCustomerPhone}
              onChange={(e) => setNewCustomerPhone(e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setNewCustomerOpen(false)} disabled={creatingCustomer}>
            Cancel
          </Button>
          <Button onClick={handleCreateInlineCustomer} disabled={creatingCustomer}>
            {creatingCustomer && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create &amp; Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
