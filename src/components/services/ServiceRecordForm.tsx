import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getAuthUser, fetchServiceFormOptions, findVehicleByVin, upsertBookingVehicle, upsertCustomerRpc, updateServiceRecord } from "@/application/queries/service-form.query";
import { decodeVinNumber } from "@/application/commands/vin.command";
import { Loader2, User, Car, Wrench, Search, Plus, Check, ChevronDown } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { useTerminology } from "@/contexts/TerminologyContext";
import { createServiceRecord, type ServiceRecordData } from "@/application/commands/service-record.command";
import { cn } from "@/lib/utils";
import { bankersRound, computeFinancialSummary } from '@/lib/financialMath';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  labor_rate: number | null;
  estimated_duration: number | null;
}

interface ServiceRecordFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (serviceId: string) => void;
  /**
   * Business owner's user_id. When the caller is a technician (auth.uid()
   * differs from the business owner), pass the resolved businessUserId from
   * useTechIdentity so customer/vehicle/service writes are correctly scoped
   * to the business — not the technician's auth account.
   * Defaults to the authenticated user when omitted (owner flows).
   */
  businessUserId?: string;
  editingService?: {
    id: string;
    customer_id: string | null;
    vehicle_id: string | null;
    service_date: string;
    service_type: string;
    description: string;
    parts_used: string | null;
    labor_hours: number | null;
    labor_cost: number | null;
    parts_cost: number | null;
    total_cost: number;
    status: string;
    notes: string | null;
    technician: string | null;
  } | null;
  prefillData?: {
    customerId?: string;
    vehicleId?: string;
    serviceType?: string;
    description?: string;
    estimatedCost?: number;
    appointmentId?: string;
  };
}

const CUSTOM_SERVICE_VALUE = "__custom_service__";

// --- Customer Mode ---
type CustomerMode = "choose" | "new";

// --- Decoded vehicle from NHTSA ---
interface DecodedVehicle {
  year: string;
  make: string;
  model: string;
  engine: string;
  trim: string;
}

export function ServiceRecordForm({
  open,
  onOpenChange,
  onSuccess,
  businessUserId,
  editingService,
  prefillData,
}: ServiceRecordFormProps) {
  const { formatCurrency } = useRegionalSettings();
  const { terms } = useTerminology();

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([]);
  const [showCustomServiceType, setShowCustomServiceType] = useState(false);

  // Customer section state
  const [customerMode, setCustomerMode] = useState<CustomerMode>("choose");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(prefillData?.customerId || null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  // New customer fields
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "" });

  // Vehicle / VIN section state
  const [vin, setVin] = useState("");
  const [vinLoading, setVinLoading] = useState(false);
  const [decodedVehicle, setDecodedVehicle] = useState<DecodedVehicle | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(prefillData?.vehicleId || null);
  // Manual override if NHTSA decode failed
  const [manualVehicle, setManualVehicle] = useState({ year: "", make: "", model: "" });
  const [useManual, setUseManual] = useState(false);

  const [formData, setFormData] = useState({
    service_date: format(new Date(), "yyyy-MM-dd"),
    service_type: prefillData?.serviceType || "",
    description: prefillData?.description || "",
    parts_used: "",
    labor_hours: "",
    labor_cost: prefillData?.estimatedCost?.toString() || "",
    parts_cost: "",
    total_cost: prefillData?.estimatedCost?.toString() || "",
    status: "completed" as string,
    notes: "",
    technician: "",
    shop_supplies: "",
    tax_rate: "",
    discount_amount: "",
    discount_type: "fixed",
  });

  const fetchData = useCallback(async () => {
    const user = await getAuthUser();
    if (!user) return;
    const [customersRes, catalogRes] = await fetchServiceFormOptions();
    if (customersRes.data) setCustomers(customersRes.data);
    if (catalogRes.data) setServiceCatalog(catalogRes.data);
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  // Reset when dialog closes or when editing
  useEffect(() => {
    if (editingService) {
      const isCustomType = !serviceCatalog.some(cat => cat.name === editingService.service_type);
      setShowCustomServiceType(isCustomType);
      setSelectedCustomerId(editingService.customer_id);
      setVehicleId(editingService.vehicle_id);
      setCustomerMode("choose");
      setFormData({
        service_date: editingService.service_date,
        service_type: editingService.service_type,
        description: editingService.description,
        parts_used: editingService.parts_used || "",
        labor_hours: editingService.labor_hours?.toString() || "",
        labor_cost: editingService.labor_cost?.toString() || "",
        parts_cost: editingService.parts_cost?.toString() || "",
        total_cost: editingService.total_cost?.toString() || "",
        status: editingService.status || "completed",
        notes: editingService.notes || "",
        technician: editingService.technician || "",
        shop_supplies: "",
        tax_rate: "",
        discount_amount: "",
        discount_type: "fixed",
      });
    } else if (!open) {
      setFormData({
        service_date: format(new Date(), "yyyy-MM-dd"),
        service_type: prefillData?.serviceType || "",
        description: prefillData?.description || "",
        parts_used: "",
        labor_hours: "",
        labor_cost: prefillData?.estimatedCost?.toString() || "",
        parts_cost: "",
        total_cost: prefillData?.estimatedCost?.toString() || "",
        status: "completed",
        notes: "",
        technician: "",
        shop_supplies: "",
        tax_rate: "",
        discount_amount: "",
        discount_type: "fixed",
      });
      setShowCustomServiceType(false);
      setSelectedCustomerId(prefillData?.customerId || null);
      setVehicleId(prefillData?.vehicleId || null);
      setCustomerMode("choose");
      setCustomerSearch("");
      setNewCustomer({ name: "", email: "", phone: "" });
      setVin("");
      setDecodedVehicle(null);
      setManualVehicle({ year: "", make: "", model: "" });
      setUseManual(false);
      lastAutoDecodeVin.current = "";
    }
  }, [editingService, open, prefillData, serviceCatalog]);

  // --- VIN Decode via NHTSA ---
  // Returns decoded vehicle so callers can use it without waiting for state update
  const decodeVinRaw = useCallback(async (vinStr: string): Promise<DecodedVehicle | null> => {
    const trimmed = vinStr.trim().toUpperCase();
    if (trimmed.length !== 17) return null;
    try {
      const decoded = await decodeVinNumber(trimmed);
      if (!decoded || !decoded.year || !decoded.make || !decoded.model) return null;
      return {
        year: String(decoded.year),
        make: decoded.make || "",
        model: decoded.model || "",
        engine: decoded.engine || "",
        trim: decoded.trim || "",
      };
    } catch {
      return null;
    }
  }, []);

  const decodeVin = useCallback(async () => {
    const trimmed = vin.trim().toUpperCase();
    if (trimmed.length < 17) {
      toast.error("VIN must be 17 characters");
      return;
    }
    setVinLoading(true);
    try {
      const decoded = await decodeVinRaw(trimmed);
      if (!decoded) {
        toast.error("Could not decode VIN — enter details manually");
        setUseManual(true);
        setDecodedVehicle(null);
      } else {
        setDecodedVehicle(decoded);
        setUseManual(false);
        toast.success(`Decoded: ${decoded.year} ${decoded.make} ${decoded.model}`);
      }
    } catch {
      toast.error("NHTSA lookup failed — enter details manually");
      setUseManual(true);
    } finally {
      setVinLoading(false);
    }
  }, [vin, decodeVinRaw]);

  // Auto-decode when VIN reaches 17 characters
  const lastAutoDecodeVin = useRef("");
  useEffect(() => {
    const trimmed = vin.trim().toUpperCase();
    if (trimmed.length === 17 && !decodedVehicle && !vinLoading && trimmed !== lastAutoDecodeVin.current) {
      lastAutoDecodeVin.current = trimmed;
      decodeVin();
    }
  }, [vin, decodeVin, decodedVehicle, vinLoading]);

  // --- Customer helpers ---
  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(customerSearch.toLowerCase())
  );
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // --- Service catalog helpers ---
  const handleServiceCatalogSelect = (value: string) => {
    if (value === CUSTOM_SERVICE_VALUE) {
      setShowCustomServiceType(true);
      setFormData(prev => ({ ...prev, service_type: "" }));
      return;
    }
    const item = serviceCatalog.find(c => c.name === value);
    if (item) {
      setShowCustomServiceType(false);
      const updated = {
        ...formData,
        service_type: item.name,
        description: item.description || formData.description,
        labor_cost: item.default_price?.toString() || formData.labor_cost,
      };
      setFormData(updated);
      calculateTotal(updated);
    }
  };

  /**
   * Recomputes total using banker's rounding (round-half-to-even) for all money math.
   */
  const calculateTotal = (data: typeof formData) => {
    let laborCost = Number(data.labor_cost);
    let partsCost = Number(data.parts_cost);
    let shopSupplies = Number(data.shop_supplies);
    let discount = Number(data.discount_amount);
    let taxRate = Number(data.tax_rate);

    if (isNaN(laborCost) || laborCost < 0) laborCost = 0;
    if (isNaN(partsCost) || partsCost < 0) partsCost = 0;
    if (isNaN(shopSupplies) || shopSupplies < 0) shopSupplies = 0;
    if (isNaN(discount) || discount < 0) discount = 0;
    if (isNaN(taxRate) || taxRate < 0) taxRate = 0;
    if (taxRate > 100) taxRate = 100;

    const subtotalBeforeDiscount = laborCost + partsCost + shopSupplies;
    const roundedSubtotalBeforeDiscount = bankersRound(subtotalBeforeDiscount, 2);
    const effectiveDiscount = discount > roundedSubtotalBeforeDiscount ? roundedSubtotalBeforeDiscount : discount;
    const subtotal = bankersRound(laborCost + partsCost + shopSupplies, 2);

    if (discount > roundedSubtotalBeforeDiscount && discount > 0) {
      toast.warning(`Discount capped at subtotal amount ($${roundedSubtotalBeforeDiscount})`);
    }

    const summary = computeFinancialSummary({
      subtotal,
      discount: effectiveDiscount,
      taxRate: taxRate / 100,
    });

    if (summary.total > 1000000) {
      toast.error("Total amount exceeds maximum allowed ($1,000,000)");
      return;
    }

    setFormData(prev => ({ ...prev, total_cost: String(summary.total) }));
  };

  const handleFieldChange = (field: string, value: string) => {
    const newData = { ...formData, [field]: value };
    setFormData(newData);
    if (["labor_cost", "parts_cost", "shop_supplies", "discount_amount", "tax_rate"].includes(field)) {
      calculateTotal(newData);
    }
  };

  // --- Resolve or create vehicle then save ---
  const resolveVehicle = async (userId: string, customerId: string | null, liveDecoded?: DecodedVehicle | null): Promise<string | null> => {
    const vinClean = vin.trim().toUpperCase();
    const decoded = liveDecoded !== undefined ? liveDecoded : decodedVehicle;
    const effectiveVehicle = useManual ? manualVehicle : decoded ? { year: decoded.year, make: decoded.make, model: decoded.model } : null;

    if (!effectiveVehicle || !effectiveVehicle.year || !effectiveVehicle.make || !effectiveVehicle.model) {
      // No vehicle info provided — ok, return null
      return null;
    }

    // Try to find existing vehicle by VIN first
    if (vinClean.length === 17) {
      const { data: existing } = await findVehicleByVin(userId, vinClean);
      if (existing) return existing.id;
    }

    // Upsert via RPC
    const { data: vid, error } = await upsertBookingVehicle({
      p_business_user_id: userId,
      p_customer_id: customerId,
      p_year: parseInt(effectiveVehicle.year),
      p_make: effectiveVehicle.make,
      p_model: effectiveVehicle.model,
      p_vin: vinClean.length === 17 ? vinClean : null,
      p_engine: decoded?.engine || null,
    });
    if (error) {
      console.error("upsert_booking_vehicle error", error);
      return null;
    }
    return vid as string;
  };

  const handleSubmit = async () => {
    if (!formData.service_type.trim()) { toast.error("Please select or enter a service type"); return; }
    if (!formData.description.trim()) { toast.error("Please enter a description"); return; }

    // Validate customer
    if (customerMode === "new" && !newCustomer.name.trim()) {
      toast.error("Please enter the customer's name");
      return;
    }

    setLoading(true);
    try {
      const user = await getAuthUser();
      if (!user) throw new Error("Not authenticated");

      // When a technician is creating the record, all tenant-scoped writes
      // (customer/vehicle/service) must use the business owner's user_id.
      const tenantUserId = businessUserId || user.id;

      // 1. Resolve or create customer
      let resolvedCustomerId: string | null = selectedCustomerId;
      if (customerMode === "new") {
        if (!newCustomer.email.trim()) {
          toast.error("Please enter the customer's email to create a new customer");
          setLoading(false);
          return;
        }
        const { data: custId, error: custErr } = await upsertCustomerRpc(
          tenantUserId,
          newCustomer.email.trim().toLowerCase(),
          newCustomer.name.trim(),
          newCustomer.phone.trim() || null,
        );
        if (custErr) throw custErr;
        resolvedCustomerId = custId as string;
      }

      // 2. Resolve or create vehicle
      // If VIN entered but not yet decoded (and no decode in progress), try to decode now
      let liveDecoded = decodedVehicle;
      if (!editingService && vin.trim().length === 17 && !decodedVehicle && !useManual && !vinLoading) {
        const decoded = await decodeVinRaw(vin.trim().toUpperCase());
        if (decoded) {
          liveDecoded = decoded;
          setDecodedVehicle(decoded);
        }
      }
      let resolvedVehicleId: string | null = vehicleId;
      if (!editingService) {
        resolvedVehicleId = await resolveVehicle(tenantUserId, resolvedCustomerId, liveDecoded);
      }

      const serviceData: ServiceRecordData = {
        customerId: resolvedCustomerId,
        vehicleId: resolvedVehicleId,
        serviceDate: formData.service_date,
        serviceType: formData.service_type,
        description: formData.description,
        partsUsed: formData.parts_used || null,
        laborHours: formData.labor_hours ? bankersRound(Number(formData.labor_hours) || 0, 2) : null,
        laborCost: formData.labor_cost ? bankersRound(Number(formData.labor_cost) || 0, 2) : null,
        partsCost: formData.parts_cost ? bankersRound(Number(formData.parts_cost) || 0, 2) : null,
        totalCost: bankersRound(Number(formData.total_cost) || 0, 2),
        status: formData.status as any,
        notes: formData.notes || null,
        technician: formData.technician || null,
        shopSupplies: formData.shop_supplies ? bankersRound(Number(formData.shop_supplies) || 0, 2) : null,
        taxRate: formData.tax_rate ? bankersRound(Number(formData.tax_rate) || 0, 2) : null,
        discountType: formData.discount_type || null,
        discountAmount: formData.discount_amount ? bankersRound(Number(formData.discount_amount) || 0, 2) : null,
      };

      if (editingService) {
        const { error } = await updateServiceRecord(editingService.id, {
          customer_id: serviceData.customerId,
          vehicle_id: serviceData.vehicleId,
          service_date: serviceData.serviceDate,
          service_type: serviceData.serviceType,
          description: serviceData.description,
          parts_used: serviceData.partsUsed,
          labor_hours: serviceData.laborHours,
          labor_cost: serviceData.laborCost,
          parts_cost: serviceData.partsCost,
          total_cost: serviceData.totalCost,
          status: serviceData.status,
          notes: serviceData.notes,
          technician: serviceData.technician,
          shop_supplies: serviceData.shopSupplies,
          tax_rate: serviceData.taxRate,
          discount_type: serviceData.discountType,
          discount_amount: serviceData.discountAmount,
        });
        if (error) throw error;
        toast.success(`${terms.service} record updated`);
        onSuccess?.(editingService.id);
      } else {
        const result = await createServiceRecord(serviceData, tenantUserId);
        if (!result.success) throw new Error(result.error);
        toast.success(`${terms.service} record created`);
        onSuccess?.(result.serviceId!);
      }

      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || `Failed to save ${terms.service.toLowerCase()} record`);
    } finally {
      setLoading(false);
    }
  };

  const vehicleDisplay = decodedVehicle
    ? `${decodedVehicle.year} ${decodedVehicle.make} ${decodedVehicle.model}${decodedVehicle.trim ? ` ${decodedVehicle.trim}` : ""}${decodedVehicle.engine ? ` — ${decodedVehicle.engine}` : ""}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingService ? `Edit ${terms.service} Record` : `Create New ${terms.service} Record`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">

          {/* ── CUSTOMER SECTION ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <Label className="text-base font-semibold">{terms.customer}</Label>
              {/* Toggle between modes */}
              <div className="ml-auto flex rounded-md border border-border overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setCustomerMode("choose")}
                  className={cn("px-3 py-1 transition-colors", customerMode === "choose" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}
                >
                  Choose Existing
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode("new")}
                  className={cn("px-3 py-1 transition-colors", customerMode === "new" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}
                >
                  <Plus className="inline h-3 w-3 mr-1" />New Customer
                </button>
              </div>
            </div>

            {customerMode === "choose" ? (
              <div className="relative">
                <div
                  className="flex items-center justify-between border border-input rounded-md px-3 py-2 cursor-pointer bg-background hover:bg-muted/50"
                  onClick={() => setShowCustomerDropdown(v => !v)}
                >
                  <span className={cn("text-sm", !selectedCustomer && "text-muted-foreground")}>
                    {selectedCustomer ? selectedCustomer.name : `Select ${terms.customer.toLowerCase()}`}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
                {showCustomerDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg">
                    <div className="p-2 border-b border-border">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          autoFocus
                          placeholder="Search customers..."
                          value={customerSearch}
                          onChange={e => setCustomerSearch(e.target.value)}
                          className="pl-7 h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <div
                        className="px-3 py-2 text-sm text-muted-foreground hover:bg-muted cursor-pointer"
                        onClick={() => { setSelectedCustomerId(null); setShowCustomerDropdown(false); setCustomerSearch(""); }}
                      >
                        No {terms.customer} Selected
                      </div>
                      {filteredCustomers.map(c => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted cursor-pointer"
                          onClick={() => { setSelectedCustomerId(c.id); setShowCustomerDropdown(false); setCustomerSearch(""); }}
                        >
                          <div>
                            <p className="font-medium">{c.name}</p>
                            {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                          </div>
                          {selectedCustomerId === c.id && <Check className="h-4 w-4 text-primary" />}
                        </div>
                      ))}
                      {filteredCustomers.length === 0 && (
                        <p className="px-3 py-4 text-sm text-center text-muted-foreground">No customers found</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-muted/40 rounded-lg border border-border/60">
                <div className="space-y-1">
                  <Label className="text-xs">Name *</Label>
                  <Input
                    placeholder="Full name"
                    value={newCustomer.name}
                    onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    placeholder="Email address"
                    value={newCustomer.email}
                    onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    placeholder="Phone number"
                    value={newCustomer.phone}
                    onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* ── VEHICLE / VIN SECTION ── */}
          {!editingService && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-primary" />
                <Label className="text-base font-semibold">{terms.vehicle}</Label>
                <span className="ml-auto text-xs text-muted-foreground">Optional</span>
              </div>

              {!useManual ? (
                <>
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">VIN (auto-decoded when 17 characters entered)</Label>
                      <Input
                        placeholder="Enter 17-character VIN"
                        value={vin}
                        onChange={e => {
                          setVin(e.target.value.toUpperCase());
                          setDecodedVehicle(null);
                          lastAutoDecodeVin.current = "";
                        }}
                        maxLength={17}
                        className="font-mono uppercase"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={decodeVin}
                        disabled={vinLoading || vin.trim().length < 17}
                        className="gap-2"
                      >
                        {vinLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Decode
                      </Button>
                    </div>
                  </div>

                  {/* Decoded result */}
                  {vehicleDisplay && (
                    <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-md text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium text-foreground">{vehicleDisplay}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => { setUseManual(true); setVin(""); setDecodedVehicle(null); lastAutoDecodeVin.current = ""; }}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Enter vehicle details manually instead
                  </button>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 p-3 bg-muted/40 rounded-lg border border-border/60">
                    <div className="space-y-1">
                      <Label className="text-xs">Year</Label>
                      <Input placeholder="2022" value={manualVehicle.year} onChange={e => setManualVehicle(p => ({ ...p, year: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Make</Label>
                      <Input placeholder="Toyota" value={manualVehicle.make} onChange={e => setManualVehicle(p => ({ ...p, make: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Model</Label>
                      <Input placeholder="Camry" value={manualVehicle.model} onChange={e => setManualVehicle(p => ({ ...p, model: e.target.value }))} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setUseManual(false); setManualVehicle({ year: "", make: "", model: "" }); }}
                    className="text-xs text-primary underline-offset-2 hover:underline"
                  >
                    Decode from VIN instead
                  </button>
                </>
              )}
            </div>
          )}

          <Separator />

          {/* ── SERVICE DETAILS ── */}
          <div className="space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              {terms.service} Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{terms.service} Type</Label>
                {!showCustomServiceType ? (
                  <Select value={formData.service_type} onValueChange={handleServiceCatalogSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select service type" />
                    </SelectTrigger>
                    <SelectContent>
                      {serviceCatalog.map(item => (
                        <SelectItem key={item.id} value={item.name}>
                          {item.name} — {formatCurrency(item.default_price)}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_SERVICE_VALUE}>+ Custom Service Type</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter custom service type"
                      value={formData.service_type}
                      onChange={e => handleFieldChange("service_type", e.target.value)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowCustomServiceType(false)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{terms.service} Date</Label>
                <Input
                  type="date"
                  value={formData.service_date}
                  onChange={e => handleFieldChange("service_date", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                placeholder="Describe the work performed..."
                value={formData.description}
                onChange={e => handleFieldChange("description", e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={v => handleFieldChange("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Technician</Label>
                <Input
                  placeholder="Technician name"
                  value={formData.technician}
                  onChange={e => handleFieldChange("technician", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Parts Used</Label>
              <Textarea
                placeholder="List parts used..."
                value={formData.parts_used}
                onChange={e => handleFieldChange("parts_used", e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Labor Hours</Label>
            <Input
              type="number"
              step="0.5"
              placeholder="0"
              value={formData.labor_hours}
              onChange={e => handleFieldChange("labor_hours", e.target.value)}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Additional Notes</Label>
            <Textarea
              placeholder="Any additional notes about the service..."
              value={formData.notes}
              onChange={e => handleFieldChange("notes", e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingService ? "Update Record" : "Create Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
