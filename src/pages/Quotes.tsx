import { useEffect, useState, useCallback, useMemo } from "react";
import useIsClient from "@/hooks/useIsClient";
import {
  getCurrentUser,
  fetchQuotesPageData,
  fetchQuoteItems,
} from "@/application/queries/quotes.query";
import { RepairEstimatorDialog, type RepairEstimatorApplyPayload } from "@/components/pricing/RepairEstimatorDialog";
import { resolveShopLaborRate, marketPosition } from "@/domain/pricing/repair-estimate";
import {
  createQuote,
  updateQuote,
  deleteQuote as deleteQuoteOp,
  deleteQuoteItems,
  insertQuoteItems,
  updateQuoteStatus,
  createServiceFromQuote,
  insertLaborItems,
  insertServiceItems,
  createQuoteCustomer,
  createQuoteVehicle,
} from "@/application/commands/quotes.command";
import { decodeVinNumber } from "@/application/commands/vin.command";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useFormAutoSave } from "@/hooks/useFormAutoSave";
import { PullToRefreshContainer } from "@/components/ui/pull-to-refresh";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, FileText, Calendar, CheckCircle, UserX, Car, Wrench, Loader2, Sparkles, AlertCircle, Search } from "lucide-react";
import QuoteDocument from "@/components/QuoteDocument";
import { VehicleYMMSelector } from "@/components/vehicles/VehicleYMMSelector";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { Badge } from "@/components/ui/badge";
import { quoteSchema, inlineCustomerSchema, inlineVehicleSchema, getFirstError } from "@/lib/validation";
import { bankersRound } from '@/lib/financialMath';
import { requireWorkspaceOwnerUserId } from "@/application/tenant-workspace";
import type { Json } from "@/integrations/supabase/types";
import { QuoteRequestsInbox } from "@/components/pricing/QuoteRequestsInbox";
import type { QuoteRequest } from "@/application/queries/repair-pricing.query";

import {
  buildFleetMetadata,
  FLEET_OS_SERVICE_WRITER_TEMPLATE,
  type FleetVehicleLine,
  emptyFleetLine,
  getActiveFleetVehicles,
  getFleetQuantityMultiplier,
  readFleetQuoteStorage,
} from "@/lib/fleet-quote";
interface Quote {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  quote_number: string;
  quote_date: string;
  valid_until: string | null;
  description: string;
  labor_hours: number | null;
  labor_cost: number | null;
  parts_cost: number | null;
  total_cost: number;
  status: string;
  notes: string | null;
  fleet_metadata: Json | null;
}

interface QuoteItem {
  id: string;
  quote_id: string;
  inventory_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Customer {
  id: string;
  name: string;
}

interface Vehicle {
  id: string;
  customer_id: string | null;
  make: string;
  model: string;
  year: number;
  vin: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  sell_price: number;
}

interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  labor_rate: number | null;
}

const PROSPECT_VALUE = "__prospect__";
const NO_VEHICLE_VALUE = "__no_vehicle__";
const ADD_NEW_CUSTOMER_VALUE = "__add_new__";
const ADD_NEW_VEHICLE_VALUE = "__add_new_vehicle__";
const CUSTOM_SERVICE_VALUE = "__custom_service__";

const Quotes = () => {
  const { terms } = useTerminology();
  const { formatCurrency, formatDate, getCurrencySymbol } = useRegionalSettings();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogItem[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [vehiclesError, setVehiclesError] = useState<string | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [showCustomServiceType, setShowCustomServiceType] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [viewingQuote, setViewingQuote] = useState<Quote | null>(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [showNewVehicleForm, setShowNewVehicleForm] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [newVehicleData, setNewVehicleData] = useState({
    make: "",
    model: "",
    year: new Date().getFullYear().toString(),
    vin: "",
    license_plate: "",
  });
  const [lineItems, setLineItems] = useState<Array<{
    inventory_item_id: string;
    description: string;
    quantity: string;
    unit_price: string;
  }>>([]);
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicleLine[]>([emptyFleetLine()]);
  const [decodingIndex, setDecodingIndex] = useState<number | null>(null);
  const [repairsDialogOpen, setRepairsDialogOpen] = useState(false);
  const [estimateVin, setEstimateVin] = useState<string | null>(null);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const isClient = useIsClient();

  const defaultQuoteFormData = useCallback(() => ({
    quote_mode: "standard",
    customer_id: "",
    vehicle_id: "",
    quote_date: format(new Date(), "yyyy-MM-dd"),
    valid_until: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    description: "",
    service_type: "",
    labor_hours: "",
    labor_cost: "",
    status: "pending",
    notes: "",
  }), []);

  const [formData, setFormData] = useState({
    quote_mode: "standard",
    customer_id: "",
    vehicle_id: "",
    quote_date: "",
    valid_until: "",
    description: "",
    service_type: "",
    labor_hours: "",
    labor_cost: "",
    status: "pending",
    notes: "",
  });


  const { clear: clearQuoteDraft, label: quoteDraftLabel, lastSavedAt: quoteDraftLastSavedAt, restore: restoreQuoteDraft } = useFormAutoSave({
    key: `quote-form-draft:${editingQuote?.id ?? "new"}`,
    value: { formData, lineItems, fleetVehicles },
    enabled: open && !editingQuote,
  });

  useEffect(() => {
    if (!isClient) return;
    // Populate deterministic defaults on client to avoid SSR hydration mismatch
    setFormData(prev => ({
      ...prev,
      quote_date: prev.quote_date || format(new Date(), "yyyy-MM-dd"),
      valid_until: prev.valid_until || format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
    }));
  }, [isClient]);

  useEffect(() => {
    if (!open || editingQuote) return;
    const restored = restoreQuoteDraft();
    if (!restored) return;
    setFormData({ ...defaultQuoteFormData(), ...restored.formData });
    setLineItems(restored.lineItems ?? []);
    setFleetVehicles(restored.fleetVehicles?.length ? restored.fleetVehicles : [emptyFleetLine()]);
  }, [defaultQuoteFormData, editingQuote, open, restoreQuoteDraft]);

  useEffect(() => {
    // Show all vehicles regardless of customer selection
    setFilteredVehicles(vehicles);
  }, [vehicles]);

  const vehicleYears = useMemo(() => {
    const years = new Set<string>();
    for (const v of vehicles) years.add(String(v.year));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [vehicles]);

  const vehicleMakes = useMemo(() => {
    const makes = new Set<string>();
    for (const v of vehicles) makes.add(v.make);
    return Array.from(makes).sort((a, b) => a.localeCompare(b));
  }, [vehicles]);

  const fetchData = useCallback(async () => {
    const user = await getCurrentUser();
    if (!user) return;
    const ownerUserId = await requireWorkspaceOwnerUserId();
    setQuotesLoading(true); setCustomersLoading(true); setVehiclesLoading(true); setInventoryLoading(true); setCatalogLoading(true);
    setQuotesError(null); setCustomersError(null); setVehiclesError(null); setInventoryError(null); setCatalogError(null);

    const [quotesRes, customersRes, vehiclesRes, inventoryRes, catalogRes] = await fetchQuotesPageData();

    if (quotesRes.error) { setQuotesError(quotesRes.error.message || "Failed to load quotes"); toast.error("Failed to load quotes"); }
    if (quotesRes.data) setQuotes((quotesRes.data as unknown as Quote[]).map((q) => ({ ...q, fleet_metadata: q.fleet_metadata ?? null })));
    setQuotesLoading(false);

    if (customersRes.error) { setCustomersError(customersRes.error.message || "Failed to load customers"); toast.error("Failed to load customers"); }
    if (customersRes.data) setCustomers(customersRes.data);
    setCustomersLoading(false);

    if (vehiclesRes.error) { setVehiclesError(vehiclesRes.error.message || "Failed to load vehicles"); toast.error("Failed to load vehicles"); }
    if (vehiclesRes.data) setVehicles(vehiclesRes.data);
    setVehiclesLoading(false);

    if (inventoryRes.error) { setInventoryError(inventoryRes.error.message || "Failed to load inventory"); toast.error("Failed to load inventory"); }
    if (inventoryRes.data) setInventory(inventoryRes.data);
    setInventoryLoading(false);

    if (catalogRes.error) { setCatalogError(catalogRes.error.message || "Failed to load service catalog"); toast.error("Failed to load service catalog"); }
    if (catalogRes.data) setServiceCatalog(catalogRes.data);
    setCatalogLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { containerRef, isRefreshing } = usePullToRefresh({
    onRefresh: fetchData,
  });

  const handleServiceCatalogSelect = (value: string) => {
    if (value === CUSTOM_SERVICE_VALUE) {
      setShowCustomServiceType(true);
      setFormData({ ...formData, service_type: "" });
      return;
    }
    const catalogItem = serviceCatalog.find(c => c.name === value);
    if (catalogItem) {
      setShowCustomServiceType(false);
      setFormData({
        ...formData,
        service_type: catalogItem.name,
        description: catalogItem.description || formData.description,
        labor_cost: catalogItem.default_price?.toString() || formData.labor_cost,
      });
    }
  };

  const generateQuoteNumber = () => {
    const date = new Date();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `QT-${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${random}`;
  };

  const [quoteNumber, setQuoteNumber] = useState<string>("");

  useEffect(() => {
    if (!isClient) return;
    if (!editingQuote) {
      setQuoteNumber(generateQuoteNumber());
    } else {
      setQuoteNumber(editingQuote.quote_number || "");
    }
  }, [isClient, editingQuote]);

  const calculateTotal = () => {
    const fleetMultiplier = formData.quote_mode === "fleet"
      ? getFleetQuantityMultiplier(fleetVehicles)
      : 1;
    const laborCost = bankersRound(Number(formData.labor_cost) || 0, 2);
    const partsCost = lineItems.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      return bankersRound(sum + bankersRound(qty * price, 4), 2);
    }, 0);
    return bankersRound((laborCost + partsCost) * fleetMultiplier, 2);
  };

  const handleAddLineItem = () => {
    setLineItems([...lineItems, {
      inventory_item_id: "",
      description: "",
      quantity: "1",
      unit_price: "",
    }]);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleLineItemChange = (index: number, field: string, value: string) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === "inventory_item_id" && value) {
      const item = inventory.find(i => i.id === value);
      if (item) {
        updated[index].description = item.name;
        updated[index].unit_price = item.sell_price.toString();
      }
    }
    
    setLineItems(updated);
  };

  const handleAddFleetVehicle = () => {
    setFleetVehicles((prev) => [...prev, emptyFleetLine()]);
  };

  const handleRemoveFleetVehicle = (index: number) => {
    setFleetVehicles((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleFleetVehicleChange = (index: number, field: keyof FleetVehicleLine, value: string) => {
    setFleetVehicles((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = {
        ...current,
        [field]: field === "vin" ? value.toUpperCase() : value,
        decode_status: field === "vin" ? "idle" : current.decode_status,
      };
      return next;
    });
  };

  const handleInsertFleetTemplate = () => {
    setFormData((prev) => {
      const nextNotes = prev.notes?.trim()
        ? `${prev.notes.trim()}\n\n${FLEET_OS_SERVICE_WRITER_TEMPLATE}`
        : FLEET_OS_SERVICE_WRITER_TEMPLATE;
      return { ...prev, notes: nextNotes };
    });
    toast.success("Fleet OS Service Writer template inserted into notes.");
  };

  const handleDecodeFleetVin = async (index: number) => {
    const row = fleetVehicles[index];
    if (!row) return;
    const vin = row.vin.replace(/\s/g, "").toUpperCase();
    if (vin.length !== 17) {
      toast.error("VIN must be exactly 17 characters");
      return;
    }

    try {
      setDecodingIndex(index);
      const decoded = await decodeVinNumber(vin);
      setFleetVehicles((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = {
          ...next[index],
          vin,
          year: decoded.year ? String(decoded.year) : next[index].year,
          make: decoded.make || next[index].make,
          model: decoded.model || next[index].model,
          engine: decoded.engine || null,
          fuel_type: decoded.fuelType || null,
          drive_type: decoded.driveType || null,
          body_class: decoded.bodyClass || null,
          transmission: decoded.transmission || null,
          decode_status: decoded.year || decoded.make || decoded.model ? "decoded" : "failed",
        };
        return next;
      });
      toast.success("VIN decoded");
    } catch {
      setFleetVehicles((prev) => {
        const next = [...prev];
        if (!next[index]) return prev;
        next[index] = { ...next[index], decode_status: "failed" };
        return next;
      });
      toast.error("VIN decode failed — use manual Year/Make/Model");
    } finally {
      setDecodingIndex(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    const validationResult = quoteSchema.safeParse({
      description: formData.description,
      quote_date: formData.quote_date,
      valid_until: formData.valid_until,
      labor_hours: formData.labor_hours ? Number(formData.labor_hours) : null,
      labor_cost: formData.labor_cost ? bankersRound(Number(formData.labor_cost) || 0, 2) : null,
      status: formData.status as "pending" | "accepted" | "rejected" | "expired",
      notes: formData.notes,
    });
    
    if (!validationResult.success) {
      toast.error(getFirstError(validationResult) || "Validation error");
      return;
    }

    const activeFleetRows = getActiveFleetVehicles(fleetVehicles);
    if (formData.quote_mode === "fleet" && activeFleetRows.length === 0) {
      toast.error("Fleet quotes require at least one vehicle row.");
      return;
    }
    if (formData.quote_mode === "fleet") {
      for (const row of activeFleetRows) {
        if (row.vin && row.vin.replace(/\s/g, "").length !== 17) {
          toast.error("Each VIN must be exactly 17 characters or be left blank.");
          return;
        }
        if (!row.year || !row.make || !row.model) {
          toast.error("Each fleet row must include Year, Make, and Model.");
          return;
        }
        if ((Number(row.quantity) || 0) < 1) {
          toast.error("Fleet vehicle quantity must be at least 1.");
          return;
        }
      }
    }
    
    const user = await getCurrentUser();
    if (!user) return;
    const ownerUserId = await requireWorkspaceOwnerUserId();

    const fleetMultiplier = formData.quote_mode === "fleet"
      ? getFleetQuantityMultiplier(fleetVehicles)
      : 1;
    const partsCost = lineItems.reduce((sum, item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unit_price) || 0;
      return bankersRound(sum + bankersRound(qty * price, 4), 2);
    }, 0);
    const scaledPartsCost = bankersRound(partsCost * fleetMultiplier, 2);
    const scaledLaborCost = bankersRound((Number(formData.labor_cost) || 0) * fleetMultiplier, 2);

    const totalCost = bankersRound(
      scaledLaborCost + scaledPartsCost, 2);

    const quoteData = {
      customer_id: formData.customer_id && formData.customer_id !== PROSPECT_VALUE ? formData.customer_id : null,
      vehicle_id: formData.vehicle_id && formData.vehicle_id !== NO_VEHICLE_VALUE ? formData.vehicle_id : null,
      quote_number: editingQuote?.quote_number || quoteNumber || generateQuoteNumber(),
      quote_date: validationResult.data.quote_date,
      valid_until: validationResult.data.valid_until || null,
      description: validationResult.data.description,
      labor_hours: validationResult.data.labor_hours,
      labor_cost: scaledLaborCost,
      parts_cost: scaledPartsCost,
      total_cost: totalCost,
      status: validationResult.data.status,
      notes: validationResult.data.notes || null,
      fleet_metadata: formData.quote_mode === "fleet"
        ? buildFleetMetadata(fleetVehicles)
        : null,
    };

    if (editingQuote) {
      const { error } = await updateQuote(editingQuote.id, quoteData);

      if (error) {
        toast.error("Failed to update quote");
        return;
      }

      await deleteQuoteItems(editingQuote.id);
      
      if (lineItems.length > 0) {
        const itemsToInsert = lineItems.map(item => ({
          quote_id: editingQuote.id,
          description: item.description,
          quantity: parseInt(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          total_price: bankersRound(
            ((parseInt(item.quantity) || 1) * bankersRound(Number(item.unit_price) || 0, 4)) * fleetMultiplier,
          2),
          inventory_item_id: item.inventory_item_id || null,
        }));
        await insertQuoteItems(itemsToInsert);
      }

      toast.success("Quote updated successfully");
    } else {
      const { data: newQuote, error } = await createQuote({ ...quoteData, user_id: ownerUserId });

      if (error) {
        toast.error("Failed to create quote");
        return;
      }

      if (lineItems.length > 0 && newQuote) {
        const itemsToInsert = lineItems.map(item => ({
          quote_id: newQuote.id,
          description: item.description,
          quantity: parseInt(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          total_price: bankersRound(
            ((parseInt(item.quantity) || 1) * bankersRound(Number(item.unit_price) || 0, 4)) * fleetMultiplier,
          2),
          inventory_item_id: item.inventory_item_id || null,
        }));
        await insertQuoteItems(itemsToInsert);
      }

      toast.success("Quote created successfully");
    }

    clearQuoteDraft();
    setOpen(false);
    resetForm();
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this quote?")) return;

    const { error } = await deleteQuoteOp(id);

    if (error) {
      toast.error("Failed to delete quote");
    } else {
      toast.success("Quote deleted successfully");
      fetchData();
    }
  };

  const handleConvertToService = async (quote: Quote) => {
    const user = await getCurrentUser();
    if (!user) return;
    const ownerUserId = await requireWorkspaceOwnerUserId();

    const { data: newService, error: serviceError } = await createServiceFromQuote({
      user_id: ownerUserId,
      customer_id: quote.customer_id,
      vehicle_id: quote.vehicle_id,
      service_date: format(new Date(), "yyyy-MM-dd"),
      service_type: "Service from Quote",
      description: quote.description,
      labor_hours: quote.labor_hours,
      labor_cost: quote.labor_cost,
      parts_cost: quote.parts_cost,
      total_cost: quote.total_cost,
      status: "completed",
      notes: `Converted from quote ${quote.quote_number}`,
    });

    if (serviceError || !newService) {
      toast.error("Failed to convert quote to service");
      return;
    }

    const { data: quoteItemsData, error: quoteItemsError } = await fetchQuoteItems(quote.id);

    const [laborInsertRes, itemsInsertRes] = await Promise.all([
      (quote.labor_cost && quote.labor_cost > 0)
        ? insertLaborItems([
            {
              service_id: newService.id,
              description: quote.description?.split("\n")[0] || "Labor",
              hours: quote.labor_hours && quote.labor_hours > 0 ? quote.labor_hours : 1,
              rate:
                quote.labor_hours && quote.labor_hours > 0
                  ? quote.labor_cost / quote.labor_hours
                  : quote.labor_cost,
              total_price: quote.labor_cost,
            },
          ])
        : Promise.resolve({ error: null }),
      quoteItemsData && quoteItemsData.length > 0
        ? insertServiceItems(
            quoteItemsData.map((item: { description: string; quantity: number; unit_price: number; total_price: number; inventory_item_id: string | null }) => ({
              service_id: newService.id,
              description: item.description,
              quantity: item.quantity,
              unit_price: item.unit_price,
              total_price: item.total_price,
              inventory_item_id: item.inventory_item_id,
            }))
          )
        : Promise.resolve({ error: null }),
    ]);

    if (quoteItemsError) {
      console.warn("Failed to load quote items for conversion:", quoteItemsError);
    }
    if (laborInsertRes?.error) {
      console.warn("Failed to create labor line-item from quote:", laborInsertRes.error);
    }
    if (itemsInsertRes?.error) {
      console.warn("Failed to create service items from quote:", itemsInsertRes.error);
    }

    await updateQuoteStatus(quote.id, "accepted");
    toast.success("Quote converted to service successfully");
    fetchData();
  };

  const handleCreateNewCustomer = async () => {
    const validationResult = inlineCustomerSchema.safeParse(newCustomerData);
    if (!validationResult.success) {
      toast.error(getFirstError(validationResult) || "Validation error");
      return;
    }
    
    const user = await getCurrentUser();
    if (!user) return;

    const { data: newCustomer, error } = await createQuoteCustomer(user.id, {
      name: validationResult.data.name,
      email: validationResult.data.email || null,
      phone: validationResult.data.phone || null,
    });

    if (error) {
      toast.error("Failed to create customer");
      return;
    }

    setCustomers([...customers, { id: newCustomer.id, name: newCustomer.name }]);
    setFormData({ ...formData, customer_id: newCustomer.id, vehicle_id: "" });
    setShowNewCustomerForm(false);
    setNewCustomerData({ name: "", email: "", phone: "" });
    toast.success("Customer created successfully");
  };

  const handleCreateNewVehicle = async () => {
    const validationResult = inlineVehicleSchema.safeParse({
      make: newVehicleData.make,
      model: newVehicleData.model,
      year: parseInt(newVehicleData.year),
      vin: newVehicleData.vin,
      license_plate: newVehicleData.license_plate,
    });
    
    if (!validationResult.success) {
      toast.error(getFirstError(validationResult) || "Validation error");
      return;
    }
    
    const user = await getCurrentUser();
    if (!user) return;

    const { data: newVehicle, error } = await createQuoteVehicle(user.id, {
      make: validationResult.data.make,
      model: validationResult.data.model,
      year: validationResult.data.year,
      vin: validationResult.data.vin || null,
      license_plate: validationResult.data.license_plate || null,
      customer_id: formData.customer_id && formData.customer_id !== PROSPECT_VALUE ? formData.customer_id : null,
    });

    if (error) {
      toast.error("Failed to create vehicle");
      return;
    }

    const vehicleObj = { id: newVehicle.id, customer_id: newVehicle.customer_id, make: newVehicle.make, model: newVehicle.model, year: newVehicle.year, vin: newVehicle.vin || null };
    setVehicles([...vehicles, vehicleObj]);
    setFilteredVehicles([...filteredVehicles, vehicleObj]);
    setFormData({ ...formData, vehicle_id: newVehicle.id });
    setShowNewVehicleForm(false);
    setNewVehicleData({ make: "", model: "", year: new Date().getFullYear().toString(), vin: "", license_plate: "" });
    toast.success("Vehicle created successfully");
  };

  /** Effective shop hourly labor rate, derived from the shop's own catalog. */
  const shopLaborRate = useMemo(
    () => resolveShopLaborRate(serviceCatalog.map((c) => c.labor_rate)),
    [serviceCatalog],
  );

  const handleFetchRepairs = () => {
    const selectedVehId = formData.vehicle_id;
    if (!selectedVehId || selectedVehId === NO_VEHICLE_VALUE) {
      toast.error("Please select a vehicle with a valid VIN to use the Repairs Estimator.");
      return;
    }

    const matchedVehicle = vehicles.find((v) => v.id === selectedVehId);
    if (!matchedVehicle || !matchedVehicle.vin || matchedVehicle.vin.length !== 17) {
      toast.error("The selected vehicle does not have a valid 17-character VIN. Please edit the vehicle details first.");
      return;
    }

    setEstimateVin(matchedVehicle.vin);
    setRepairsDialogOpen(true);
  };

  const handleApplyRepairCost = ({ repair, tier, lines, laborHours, laborCost, costs }: RepairEstimatorApplyPayload) => {
    setFormData((prev) => ({
      ...prev,
      service_type: repair.title,
      description: repair.description && repair.description !== "N/A" ? repair.description : `Perform ${repair.title}`,
      labor_cost: laborCost.toString(),
      labor_hours: laborHours > 0 ? laborHours.toString() : prev.labor_hours,
    }));

    // Append parts lines (never clobber what the writer already entered).
    const partLines = lines
      .filter((line) => line.kind === "part")
      .map((line) => ({
        inventory_item_id: "",
        description: line.description,
        quantity: line.quantity.toString(),
        unit_price: line.unitPrice.toString(),
      }));

    if (partLines.length > 0) {
      setLineItems((prev) => [...prev, ...partLines]);
    }

    const position = marketPosition(laborCost + partLines.reduce((s, l) => s + Number(l.unit_price), 0), costs.totalAvg);
    setEstimateNote(
      position
        ? `${repair.title}: ${tier} market avg ${formatCurrency(costs.totalAvg)} (range ${formatCurrency(costs.totalLow)}–${formatCurrency(costs.totalHigh)}). Your quote is ${position.label === "at" ? "at market" : `${Math.abs(position.percent)}% ${position.label} market`}.`
        : `${repair.title}: applied ${tier} market pricing.`,
    );

    toast.success(`Applied ${tier} pricing for ${repair.title} into the quote!`);
  };



  const resetForm = () => {
    setFormData(defaultQuoteFormData());
    setLineItems([]);
    setFleetVehicles([emptyFleetLine()]);
    setDecodingIndex(null);
    setEditingQuote(null);
    setShowNewCustomerForm(false);
    setShowNewVehicleForm(false);
    setShowCustomServiceType(false);
    setNewCustomerData({ name: "", email: "", phone: "" });
    setNewVehicleData({ make: "", model: "", year: new Date().getFullYear().toString(), vin: "", license_plate: "" });
  };

  /**
   * Convert an estimate-only request into a draft quote. We seed the
   * description and notes with the captured market snapshot so the shop keeps
   * the same numbers the visitor already saw.
   */
  const handleConvertQuoteRequest = (request: QuoteRequest) => {
    const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model]
      .filter(Boolean)
      .join(" ");
    const contact = [request.guest_name, request.guest_email, request.guest_phone]
      .filter(Boolean)
      .join(" · ");
    const marketLine =
      request.estimate_low && request.estimate_high
        ? `Market range: $${Math.round(request.estimate_low)} – $${Math.round(request.estimate_high)} (${request.pricing_tier})`
        : "";

    resetForm();
    setFormData({
      ...defaultQuoteFormData(),
      customer_id: PROSPECT_VALUE,
      description: [request.repair_title, vehicle].filter(Boolean).join(" — "),
      notes: [contact, marketLine, request.notes].filter(Boolean).join("\n"),
    });
    setOpen(true);
  };



  const openEditDialog = async (quote: Quote) => {
    const parsedNotes = readFleetQuoteStorage({
      notes: quote.notes,
      fleet_metadata: quote.fleet_metadata,
    });
    setEditingQuote(quote);
    // Check if the description looks like a service type from catalog
    const isFromCatalog = serviceCatalog.some(cat => cat.name === quote.description.split('\n')[0] || cat.description === quote.description);
    setShowCustomServiceType(!isFromCatalog && serviceCatalog.length > 0);
    setFormData({
      customer_id: quote.customer_id || PROSPECT_VALUE,
      quote_mode: parsedNotes.fleetVehicles.length > 0 ? "fleet" : "standard",
      vehicle_id: quote.vehicle_id || NO_VEHICLE_VALUE,
      quote_date: quote.quote_date,
      valid_until: quote.valid_until || "",
      description: quote.description,
      service_type: "",
      labor_hours: quote.labor_hours?.toString() || "",
      labor_cost: quote.labor_cost?.toString() || "",
      status: quote.status,
      notes: parsedNotes.userNotes,
    });
    setFleetVehicles(parsedNotes.fleetVehicles);

    const { data: items } = await fetchQuoteItems(quote.id);

    if (items) {
      setLineItems(items.map((item: { inventory_item_id: string | null; description: string; quantity: number; unit_price: number }) => ({
        inventory_item_id: item.inventory_item_id || "",
        description: item.description,
        quantity: item.quantity.toString(),
        unit_price: item.unit_price.toString(),
      })));
    }

    setOpen(true);
  };

  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return "Prospect";
    return customers.find(c => c.id === customerId)?.name || "Unknown";
  };

  const getVehicleInfo = (vehicleId: string | null) => {
    if (!vehicleId) return `No ${terms.vehicle}`;
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Unknown";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted": return "bg-success/20 text-success";
      case "rejected": return "bg-destructive/20 text-destructive";
      case "expired": return "bg-muted text-muted-foreground";
      default: return "bg-warning/20 text-warning";
    }
  };

  const getFleetSummary = (quote: Pick<Quote, "notes" | "fleet_metadata">) => {
    const parsed = readFleetQuoteStorage(quote);
    const rows = getActiveFleetVehicles(parsed.fleetVehicles);
    if (!rows.length) return null;
    const qty = rows.reduce((sum, row) => sum + (Number(row.quantity) || 1), 0);
    const first = rows[0];
    const title = [first.year, first.make, first.model].filter(Boolean).join(" ");
    return { qty, title, extra: Math.max(rows.length - 1, 0) };
  };

  return (
    <AppLayout title={`${terms.quote}s`}>
      <PullToRefreshContainer
        containerRef={containerRef}
        isRefreshing={isRefreshing}
      >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Quotes</h2>
            <p className="text-sm sm:text-base text-muted-foreground">Create and manage service quotes</p>
          </div>
          <Dialog open={open} onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (!isOpen) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2 w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                New Quote
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingQuote ? "Edit Quote" : "Create New Quote"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {!editingQuote && quoteDraftLastSavedAt && (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{quoteDraftLabel}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer">{terms.customer} (Optional)</Label>
                    {!showNewCustomerForm ? (
                      <Select
                        value={formData.customer_id || PROSPECT_VALUE}
                        onValueChange={(value) => {
                          if (value === ADD_NEW_CUSTOMER_VALUE) {
                            setShowNewCustomerForm(true);
                          } else {
                            setFormData({ ...formData, customer_id: value, vehicle_id: "" });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Select ${terms.customer.toLowerCase()} or prospect`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ADD_NEW_CUSTOMER_VALUE}>
                            <span className="flex items-center gap-2 text-primary">
                              <Plus className="h-4 w-4" />
                              Add New {terms.customer}
                            </span>
                          </SelectItem>
                          <SelectItem value={PROSPECT_VALUE}>
                            <span className="flex items-center gap-2">
                              <UserX className="h-4 w-4" />
                              Prospect / No {terms.customer}
                            </span>
                          </SelectItem>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Card className="p-4 space-y-3 border-primary/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">New {terms.customer}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowNewCustomerForm(false);
                              setNewCustomerData({ name: "", email: "", phone: "" });
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                        <Input
                          placeholder="Name *"
                          value={newCustomerData.name}
                          onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                        />
                        <Input
                          placeholder="Email"
                          type="email"
                          value={newCustomerData.email}
                          onChange={(e) => setNewCustomerData({ ...newCustomerData, email: e.target.value })}
                        />
                        <Input
                          placeholder="Phone"
                          value={newCustomerData.phone}
                          onChange={(e) => setNewCustomerData({ ...newCustomerData, phone: e.target.value })}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="w-full"
                          onClick={handleCreateNewCustomer}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Create {terms.customer}
                        </Button>
                      </Card>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vehicle">{terms.vehicle} (Optional)</Label>
                    {!showNewVehicleForm ? (
                      <Select
                        value={formData.vehicle_id || NO_VEHICLE_VALUE}
                        onValueChange={(value) => {
                          if (value === ADD_NEW_VEHICLE_VALUE) {
                            setShowNewVehicleForm(true);
                          } else {
                            setFormData({ ...formData, vehicle_id: value });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Select ${terms.vehicle.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ADD_NEW_VEHICLE_VALUE}>
                            <span className="flex items-center gap-2 text-primary">
                              <Plus className="h-4 w-4" />
                              Add New {terms.vehicle}
                            </span>
                          </SelectItem>
                          <SelectItem value={NO_VEHICLE_VALUE}>
                            <span className="flex items-center gap-2">
                              <Car className="h-4 w-4" />
                              No {terms.vehicle}
                            </span>
                          </SelectItem>
                          {filteredVehicles.map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id}>
                              {vehicle.year} {vehicle.make} {vehicle.model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Card className="p-4 space-y-3 border-primary/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">New {terms.vehicle}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setShowNewVehicleForm(false);
                              setNewVehicleData({ make: "", model: "", year: new Date().getFullYear().toString(), vin: "", license_plate: "" });
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                        <VehicleYMMSelector
                          required
                          value={{ year: newVehicleData.year, make: newVehicleData.make, model: newVehicleData.model }}
                          onChange={(v) => setNewVehicleData({ ...newVehicleData, year: v.year, make: v.make, model: v.model })}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            placeholder="VIN"
                            value={newVehicleData.vin}
                            onChange={(e) => setNewVehicleData({ ...newVehicleData, vin: e.target.value })}
                          />
                          <Input
                            placeholder="License Plate"
                            value={newVehicleData.license_plate}
                            onChange={(e) => setNewVehicleData({ ...newVehicleData, license_plate: e.target.value })}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="w-full"
                          onClick={handleCreateNewVehicle}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Create {terms.vehicle}
                        </Button>
                      </Card>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quote_date">Quote Date *</Label>
                    <Input
                      id="quote_date"
                      type="date"
                      value={formData.quote_date}
                      onChange={(e) => setFormData({ ...formData, quote_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valid_until">Valid Until</Label>
                    <Input
                      id="valid_until"
                      type="date"
                      value={formData.valid_until}
                      onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="accepted">Accepted</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quote_mode">Quote Mode</Label>
                  <Select
                    value={formData.quote_mode}
                    onValueChange={(value) => setFormData({ ...formData, quote_mode: value })}
                  >
                    <SelectTrigger id="quote_mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard Quote</SelectItem>
                      <SelectItem value="fleet">Fleet Quote</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Service Type</Label>
                  {!showCustomServiceType ? (
                    <Select
                      value={formData.service_type || undefined}
                      onValueChange={handleServiceCatalogSelect}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select service type (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {serviceCatalog.map(cat => (
                          <SelectItem key={cat.id} value={cat.name}>
                            <span className="flex items-center justify-between gap-2">
                              {cat.name}
                              <span className="text-muted-foreground text-xs">{formatCurrency(cat.default_price)}</span>
                            </span>
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_SERVICE_VALUE}>
                          <span className="flex items-center gap-2 text-primary">
                            <Plus className="h-4 w-4" />
                            Custom Description
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        value={formData.service_type}
                        onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
                        placeholder="Enter custom service type"
                      />
                      <Button type="button" variant="outline" size="icon" onClick={() => setShowCustomServiceType(false)} title="Select from catalog">
                        <Wrench className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {formData.vehicle_id && formData.vehicle_id !== NO_VEHICLE_VALUE && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/[0.03] text-xs font-semibold"
                      onClick={handleFetchRepairs}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Auto-Price Estimator (Market Repairs)
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the proposed work"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                    required
                  />
                </div>

                {formData.quote_mode === "fleet" && (
                <div className="space-y-4 border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Fleet Vehicles (V1 Core)</Label>
                      <p className="text-xs text-muted-foreground">Decode VIN with NHTSA or select Year/Make/Model manually.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddFleetVehicle}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Vehicle Row
                    </Button>
                  </div>

                  {fleetVehicles.map((fleet, index) => {
                    const filteredByYear = fleet.year
                      ? vehicles.filter((v) => String(v.year) === fleet.year)
                      : vehicles;
                    const modelsForMake = filteredByYear
                      .filter((v) => !fleet.make || v.make === fleet.make)
                      .map((v) => v.model);
                    const uniqueModels = Array.from(new Set(modelsForMake)).sort((a, b) => a.localeCompare(b));
                    return (
                      <div key={index} className="border rounded p-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                          <div className="md:col-span-2">
                            <Label>VIN</Label>
                            <Input
                              value={fleet.vin}
                              onChange={(e) => handleFleetVehicleChange(index, "vin", e.target.value)}
                              placeholder="17-character VIN"
                              maxLength={17}
                              className="font-mono uppercase"
                            />
                          </div>
                          <div>
                            <Label>Year</Label>
                            <Select value={fleet.year || undefined} onValueChange={(value) => handleFleetVehicleChange(index, "year", value)}>
                              <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                              <SelectContent>
                                {vehicleYears.map((year) => (
                                  <SelectItem key={year} value={year}>{year}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Make</Label>
                            <Select value={fleet.make || undefined} onValueChange={(value) => handleFleetVehicleChange(index, "make", value)}>
                              <SelectTrigger><SelectValue placeholder="Make" /></SelectTrigger>
                              <SelectContent>
                                {vehicleMakes.map((make) => (
                                  <SelectItem key={make} value={make}>{make}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              className="mt-2"
                              placeholder="Or type make"
                              value={fleet.make}
                              onChange={(e) => handleFleetVehicleChange(index, "make", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Model</Label>
                            <Select value={fleet.model || undefined} onValueChange={(value) => handleFleetVehicleChange(index, "model", value)}>
                              <SelectTrigger><SelectValue placeholder="Model" /></SelectTrigger>
                              <SelectContent>
                                {uniqueModels.map((model) => (
                                  <SelectItem key={model} value={model}>{model}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              className="mt-2"
                              placeholder="Or type model"
                              value={fleet.model}
                              onChange={(e) => handleFleetVehicleChange(index, "model", e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Qty</Label>
                            <Input
                              type="number"
                              min={1}
                              value={fleet.quantity}
                              onChange={(e) => handleFleetVehicleChange(index, "quantity", e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={decodingIndex === index}
                            onClick={() => handleDecodeFleetVin(index)}
                          >
                            {decodingIndex === index ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                            Decode VIN
                          </Button>
                          <Badge variant={fleet.decode_status === "decoded" ? "default" : fleet.decode_status === "failed" ? "destructive" : "secondary"}>
                            {fleet.decode_status}
                          </Badge>
                          <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveFleetVehicle(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {(fleet.engine || fleet.fuel_type || fleet.drive_type || fleet.body_class || fleet.transmission) && (
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs text-muted-foreground">
                            <div><span className="font-medium text-foreground">Engine:</span> {fleet.engine || "—"}</div>
                            <div><span className="font-medium text-foreground">Fuel:</span> {fleet.fuel_type || "—"}</div>
                            <div><span className="font-medium text-foreground">Drive:</span> {fleet.drive_type || "—"}</div>
                            <div><span className="font-medium text-foreground">Body:</span> {fleet.body_class || "—"}</div>
                            <div><span className="font-medium text-foreground">Trans:</span> {fleet.transmission || "—"}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Line Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddLineItem}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  
                  {lineItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <Label>Item</Label>
                        <Select
                          value={item.inventory_item_id}
                          onValueChange={(value) => handleLineItemChange(index, "inventory_item_id", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select or type custom" />
                          </SelectTrigger>
                          <SelectContent>
                            {inventory.map((inv) => (
                              <SelectItem key={inv.id} value={inv.id}>
                                {inv.name} - {formatCurrency(inv.sell_price)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3">
                        <Label>Description</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, "description", e.target.value)}
                          placeholder="Description"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Qty</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(index, "quantity", e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => handleLineItemChange(index, "unit_price", e.target.value)}
                        />
                      </div>
                      <div className="col-span-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveLineItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="labor_hours">Labor Hours</Label>
                    <Input
                      id="labor_hours"
                      type="number"
                      step="0.1"
                      placeholder="0.0"
                      value={formData.labor_hours}
                      onChange={(e) => setFormData({ ...formData, labor_hours: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="labor_cost">Labor Cost ({getCurrencySymbol()})</Label>
                    <Input
                      id="labor_cost"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.labor_cost}
                      onChange={(e) => setFormData({ ...formData, labor_cost: e.target.value })}
                    />
                  </div>
                </div>

                {estimateNote && (
                  <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
                    <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">{estimateNote}</p>
                  </div>
                )}



                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-lg font-semibold">Total Quote: {formatCurrency(calculateTotal())}</p>
                  {formData.quote_mode === "fleet" && (
                    <p className="text-xs text-muted-foreground">
                      Fleet pricing multiplier: x{getFleetQuantityMultiplier(fleetVehicles)} vehicle(s)
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="notes">Notes</Label>
                    {formData.quote_mode === "fleet" && (
                      <Button type="button" variant="outline" size="sm" onClick={handleInsertFleetTemplate}>
                        Insert Fleet OS Template
                      </Button>
                    )}
                  </div>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={formData.quote_mode === "fleet" ? 10 : 2}
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingQuote ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <QuoteRequestsInbox onConvert={handleConvertQuoteRequest} />

        <div className="space-y-4">

          {quotesLoading ? (
            <div className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /></div>
          ) : quotesError ? (
            <div className="py-4 text-center text-red-700 bg-red-50 rounded p-4">{quotesError}</div>
          ) : (
            <>
              {quotes.map((quote) => {
                const fleetSummary = getFleetSummary(quote);
                return (
                <Card key={quote.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>{quote.quote_number}</span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(quote.status)}`}>
                      {quote.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setViewingQuote(quote)}
                      title="View/Print Quote"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    {quote.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleConvertToService(quote)}
                        title="Convert to Service"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(quote)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(quote.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Customer</p>
                    <p className="font-semibold">{getCustomerName(quote.customer_id)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Vehicle</p>
                    <p className="font-semibold">{getVehicleInfo(quote.vehicle_id)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total</p>
                    <p className="font-semibold text-lg">{formatCurrency(quote.total_cost)}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{quote.description}</p>
                {fleetSummary && (
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary">Fleet • {fleetSummary.qty} units</Badge>
                    <span className="text-muted-foreground">
                      {fleetSummary.title || "Fleet vehicles"}
                      {fleetSummary.extra > 0 ? ` +${fleetSummary.extra} more type(s)` : ""}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(quote.quote_date)}
                  </span>
                  {quote.valid_until && (
                    <span>Valid until: {formatDate(quote.valid_until)}</span>
                  )}
                </div>
              </CardContent>
            </Card>
              );})}
            </>)}
          </div>

        {quotes.length === 0 && (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No quotes yet. Create your first quote!</p>
          </div>
        )}
      </div>

      {viewingQuote && (
        <QuoteDocument
          quoteId={viewingQuote.id}
          customerId={viewingQuote.customer_id}
          vehicleId={viewingQuote.vehicle_id}
          onClose={() => setViewingQuote(null)}
        />
      )}

      {/* Market Repairs Price Estimator (shared component) */}
      <RepairEstimatorDialog
        open={repairsDialogOpen}
        onOpenChange={setRepairsDialogOpen}
        vin={estimateVin}
        laborRate={shopLaborRate}
        onApply={handleApplyRepairCost}
      />

      </PullToRefreshContainer>
    </AppLayout>
  );
};

export default Quotes;
