import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, addHours, addMinutes, format, isBefore, isSameDay, parse, parseISO, setHours, setMinutes } from "date-fns";
import { Calendar as CalendarIcon, Car, DollarSign, Loader2, Plus, Search, Users } from "lucide-react";
import type { Appointment, BusinessHours, Customer, ServiceCatalogItem, Vehicle } from "@/shared/types";
import type { AppointmentFormState, CustomerFormData, VehicleFormData } from "@/shared/types/forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { VehicleYMMSelector } from "@/components/vehicles/VehicleYMMSelector";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { bankersRound, formatMoney } from "@/lib/financialMath";
import { formatPhoneInput, normalizePhoneToE164 } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { useFormAutoSave } from "@/hooks/useFormAutoSave";
import { fetchAvailabilityPageData } from "@/application/queries/availability-settings.query";
import { fetchWorkspaceBookedSlots, type BookedSlot } from "@/application/queries/availability.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { nextApi } from "@/lib/nextApiClient";
import { toast } from "@/components/ui/sonner";

interface DayHours { open: string; close: string; is_open: boolean }
type WeeklySchedule = Record<string, DayHours>;

interface AppointmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: AppointmentFormState) => Promise<void>;
  initialData?: Partial<Appointment> | null;
  customers: Customer[];
  vehicles: Vehicle[];
  serviceCatalog: ServiceCatalogItem[];
  businessHours: BusinessHours;
  saving: boolean;
  isEditing: boolean;
  onCreateCustomer: (data: CustomerFormData) => Promise<Customer | null>;
  onCreateVehicle: (data: VehicleFormData) => Promise<Vehicle | null>;
  businessUserId?: string;
}

const safe = (value: unknown) => {
  if (value == null) return "";
  const text = String(value).trim();
  return text === "undefined" || text === "null" ? "" : text;
};

const hhmm = (value: string | null | undefined) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "";
};

const dayKey = (date: Date) => format(date, "EEEE").toLowerCase();

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first_name: parts.shift() || "Customer", last_name: parts.join(" ") || "Record" };
};

export const AppointmentForm = ({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  customers,
  vehicles,
  serviceCatalog,
  businessHours,
  saving,
  isEditing,
}: AppointmentFormProps) => {
  const { formatTime } = useRegionalSettings();
  const [formData, setFormData] = useState<AppointmentFormState>({});
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [overrideAvailability, setOverrideAvailability] = useState(false);
  const [sendEmailNotification, setSendEmailNotification] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [createdCustomers, setCreatedCustomers] = useState<Customer[]>([]);
  const [createdVehicles, setCreatedVehicles] = useState<Vehicle[]>([]);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "" });
  const [newVehicle, setNewVehicle] = useState({ year: "", make: "", model: "", license_plate: "", vin: "" });
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>({});
  const [slotDuration, setSlotDuration] = useState(businessHours.slot_duration_minutes ?? 30);
  const [leadHours, setLeadHours] = useState(businessHours.min_lead_time_hours ?? 0);
  const [bufferBefore, setBufferBefore] = useState(businessHours.buffer_time_before ?? 0);
  const [bufferAfter, setBufferAfter] = useState(businessHours.buffer_time_after ?? 0);
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());

  const draftKey = `appointment-form-draft:${isEditing ? (initialData as { id?: string } | null)?.id ?? "editing" : "new"}`;
  const { clear: clearDraft, label: draftLabel, lastSavedAt: draftLastSavedAt, restore: restoreDraft } = useFormAutoSave({
    key: draftKey,
    value: formData,
    enabled: open && Object.keys(formData).length > 0,
  });

  const allCustomers = useMemo(() => {
    const byId = new Map<string, Customer>();
    [...customers, ...createdCustomers].forEach((customer) => byId.set(customer.id, customer));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, createdCustomers]);

  const allVehicles = useMemo(() => {
    const byId = new Map<string, Vehicle>();
    [...vehicles, ...createdVehicles].forEach((vehicle) => byId.set(vehicle.id, vehicle));
    return [...byId.values()];
  }, [vehicles, createdVehicles]);

  const selectedCustomer = useMemo(
    () => allCustomers.find((customer) => customer.id === formData.customer_id) ?? null,
    [allCustomers, formData.customer_id],
  );

  const customerVehicles = useMemo(
    () => formData.customer_id ? allVehicles.filter((vehicle) => vehicle.customer_id === formData.customer_id) : [],
    [allVehicles, formData.customer_id],
  );

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return allCustomers.slice(0, 100);
    return allCustomers.filter((customer) =>
      `${customer.name} ${customer.email || ""} ${customer.phone || ""}`.toLowerCase().includes(q),
    ).slice(0, 100);
  }, [allCustomers, customerSearch]);

  const dateRange = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(new Date(), index)), []);

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      const raw = initialData as Record<string, unknown>;
      const date = initialData.scheduled_date ? parseISO(initialData.scheduled_date) : new Date();
      setSelectedDate(date);
      setFormData({
        ...initialData,
        vehicle_id: safe(raw.vehicle_id) || undefined,
        customer_id: safe(raw.customer_id) || undefined,
        service_catalog_id: safe(raw.service_catalog_id) || undefined,
      } as AppointmentFormState);
      return;
    }
    const restored = restoreDraft();
    setSelectedDate(new Date());
    setFormData(restored ?? {
      status: "confirmed",
      duration_minutes: 60,
      scheduled_date: format(new Date(), "yyyy-MM-dd"),
    });
  }, [initialData, open, restoreDraft]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchAvailabilityPageData();
        if (cancelled) return;
        const profile = data.profile as Record<string, unknown> | null;
        const raw = profile?.day_hours && typeof profile.day_hours === "object" ? profile.day_hours as WeeklySchedule : {};
        setWeeklySchedule(raw);
        setSlotDuration(Number(profile?.slot_duration_minutes ?? businessHours.slot_duration_minutes ?? 30));
        setLeadHours(Number(profile?.min_lead_time_hours ?? businessHours.min_lead_time_hours ?? 0));
        setBufferBefore(Number(profile?.buffer_time_before ?? businessHours.buffer_time_before ?? 0));
        setBufferAfter(Number(profile?.buffer_time_after ?? businessHours.buffer_time_after ?? 0));
        setBlockedDates(new Set((data.blocked || []).map((row: { blocked_date: string }) => row.blocked_date)));
      } catch (error) {
        console.warn("[AppointmentForm] canonical availability load failed", error);
      }
    })();
    return () => { cancelled = true; };
  }, [open, businessHours]);

  useEffect(() => {
    if (!open) return;
    const date = format(selectedDate, "yyyy-MM-dd");
    setFormData((previous) => ({ ...previous, scheduled_date: date }));
    let cancelled = false;
    void fetchWorkspaceBookedSlots(date)
      .then((rows) => { if (!cancelled) setBookedSlots(rows.filter((row) => row.id !== (initialData as { id?: string } | null)?.id)); })
      .catch(() => { if (!cancelled) setBookedSlots([]); });
    return () => { cancelled = true; };
  }, [open, selectedDate, initialData]);

  const dayHours = useMemo(() => {
    const configured = weeklySchedule[dayKey(selectedDate)];
    if (configured && typeof configured.is_open === "boolean") return configured;
    const label = format(selectedDate, "EEEE");
    return {
      open: hhmm(businessHours.opening_time) || "09:00",
      close: hhmm(businessHours.closing_time) || "17:00",
      is_open: businessHours.working_days.includes(label),
    };
  }, [weeklySchedule, selectedDate, businessHours]);

  const availableSlots = useMemo(() => {
    const date = format(selectedDate, "yyyy-MM-dd");
    if (!dayHours.is_open || blockedDates.has(date)) return [];
    const opening = parse(hhmm(dayHours.open) || "09:00", "HH:mm", new Date());
    const closing = parse(hhmm(dayHours.close) || "17:00", "HH:mm", new Date());
    const interval = Math.max(5, slotDuration || 30);
    const serviceMinutes = Math.max(5, Number(formData.duration_minutes) || 60);
    const slots: string[] = [];
    for (let cursor = opening; addMinutes(cursor, serviceMinutes) <= closing; cursor = addMinutes(cursor, interval)) {
      slots.push(format(cursor, "HH:mm"));
    }
    return slots;
  }, [selectedDate, dayHours, blockedDates, slotDuration, formData.duration_minutes]);

  const isSlotBlocked = useCallback((slot: string) => {
    const duration = Math.max(5, Number(formData.duration_minutes) || 60);
    const slotStart = parse(slot, "HH:mm", new Date());
    const slotEnd = addMinutes(slotStart, duration);
    return bookedSlots.some((booked) => {
      const bookedStart = parse(hhmm(booked.scheduled_time), "HH:mm", new Date());
      const blockedStart = addMinutes(bookedStart, -bufferBefore);
      const blockedEnd = addMinutes(addMinutes(bookedStart, booked.duration_minutes || 60), bufferAfter);
      return slotStart < blockedEnd && slotEnd > blockedStart;
    });
  }, [bookedSlots, formData.duration_minutes, bufferBefore, bufferAfter]);

  const isSlotTooSoon = useCallback((slot: string) => {
    if (leadHours <= 0) return false;
    const [hour, minute] = slot.split(":").map(Number);
    const value = setMinutes(setHours(selectedDate, hour), minute);
    return isBefore(value, addHours(new Date(), leadHours));
  }, [leadHours, selectedDate]);

  const selectCustomer = useCallback((customerId: string) => {
    const customer = allCustomers.find((row) => row.id === customerId);
    if (!customer) return;
    const ownedVehicles = allVehicles.filter((vehicle) => vehicle.customer_id === customer.id);
    const onlyVehicle = ownedVehicles.length === 1 ? ownedVehicles[0] : null;
    setCreatingCustomer(false);
    setCreatingVehicle(ownedVehicles.length === 0);
    setFormData((previous) => ({
      ...previous,
      customer_id: customer.id,
      guest_name: customer.name,
      guest_email: customer.email || "",
      guest_phone: customer.phone || "",
      vehicle_id: onlyVehicle?.id ?? "",
      vehicle_year: onlyVehicle?.year ?? "",
      vehicle_make: onlyVehicle?.make ?? "",
      vehicle_model: onlyVehicle?.model ?? "",
      vehicle_license: onlyVehicle?.license_plate ?? "",
    }));
  }, [allCustomers, allVehicles]);

  const selectVehicle = useCallback((vehicleId: string) => {
    const vehicle = allVehicles.find((row) => row.id === vehicleId);
    if (!vehicle) return;
    setCreatingVehicle(false);
    setFormData((previous) => ({
      ...previous,
      vehicle_id: vehicle.id,
      vehicle_year: vehicle.year,
      vehicle_make: vehicle.make,
      vehicle_model: vehicle.model,
      vehicle_license: vehicle.license_plate || "",
    }));
  }, [allVehicles]);

  const createCustomer = async () => {
    if (!newCustomer.name.trim()) { toast.error("Customer name is required"); return; }
    const context = await resolveCurrentWorkspace();
    if (!context) { toast.error("Select a workspace first"); return; }
    try {
      const response = await nextApi.customers.create({
        workspace_id: context.workspaceId,
        ...splitName(newCustomer.name),
        email: newCustomer.email.trim() || undefined,
        phone: normalizePhoneToE164(newCustomer.phone) || newCustomer.phone.trim() || undefined,
      });
      const row = response.data as { id: string; first_name?: string; last_name?: string; email?: string | null; phone?: string | null };
      const customer: Customer = {
        id: row.id,
        name: [row.first_name, row.last_name].filter(Boolean).join(" ") || newCustomer.name.trim(),
        email: row.email || newCustomer.email.trim(),
        phone: row.phone || newCustomer.phone.trim(),
      };
      setCreatedCustomers((previous) => [...previous, customer]);
      setNewCustomer({ name: "", email: "", phone: "" });
      setCreatingCustomer(false);
      setCreatingVehicle(true);
      setFormData((previous) => ({ ...previous, customer_id: customer.id, guest_name: customer.name, guest_email: customer.email, guest_phone: customer.phone, vehicle_id: "" }));
      toast.success("Customer created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create customer");
    }
  };

  const createVehicle = async () => {
    if (!formData.customer_id) { toast.error("Select a customer first"); return; }
    const year = Number(newVehicle.year);
    if (!year || !newVehicle.make.trim() || !newVehicle.model.trim()) { toast.error("Year, make, and model are required"); return; }
    const context = await resolveCurrentWorkspace();
    if (!context) { toast.error("Select a workspace first"); return; }
    try {
      const response = await nextApi.vehicles.create({
        workspace_id: context.workspaceId,
        customer_id: formData.customer_id,
        year,
        make: newVehicle.make.trim(),
        model: newVehicle.model.trim(),
        vin: newVehicle.vin.trim() || undefined,
        license_plate: newVehicle.license_plate.trim() || undefined,
      });
      const row = response.data as { id: string; customer_id?: string | null; year?: number; make?: string; model?: string; vin?: string | null; license_plate?: string | null };
      const vehicle: Vehicle = {
        id: row.id,
        customer_id: row.customer_id || formData.customer_id,
        year: Number(row.year || year),
        make: row.make || newVehicle.make.trim(),
        model: row.model || newVehicle.model.trim(),
        vin: row.vin || undefined,
        license_plate: row.license_plate || undefined,
      };
      setCreatedVehicles((previous) => [...previous, vehicle]);
      setNewVehicle({ year: "", make: "", model: "", license_plate: "", vin: "" });
      selectVehicle(vehicle.id);
      setFormData((previous) => ({ ...previous, vehicle_id: vehicle.id, vehicle_year: vehicle.year, vehicle_make: vehicle.make, vehicle_model: vehicle.model, vehicle_license: vehicle.license_plate || "" }));
      toast.success("Vehicle created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create vehicle");
    }
  };

  const chooseService = (serviceId: string) => {
    const service = serviceCatalog.find((row) => row.id === serviceId);
    setFormData((previous) => ({
      ...previous,
      service_catalog_id: serviceId,
      title: service?.name || previous.title,
      estimated_cost: service?.default_price ?? previous.estimated_cost,
      duration_minutes: service?.estimated_duration || previous.duration_minutes || 60,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.customer_id) { toast.error("Select or create a customer"); return; }
    if (!formData.vehicle_id) { toast.error("Select or create a vehicle"); return; }
    if (!formData.service_catalog_id) { toast.error("Select a service"); return; }
    if (!formData.scheduled_time) { toast.error("Select an available time"); return; }
    const normalizedPhone = normalizePhoneToE164(formData.guest_phone || "");
    await onSubmit({ ...formData, guest_phone: normalizedPhone || formData.guest_phone, sendEmailNotification });
    clearDraft();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-full max-h-full w-full max-w-2xl flex-col bg-card p-0">
        <DialogHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <DialogClose asChild><Button variant="ghost">Close</Button></DialogClose>
            <DialogTitle>{isEditing ? "Edit Appointment" : "New Appointment"}</DialogTitle>
            <Button form="appointment-form" type="submit" disabled={saving} variant="ghost" className="text-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <form id="appointment-form" onSubmit={handleSubmit} className="space-y-8 p-6">
            {!isEditing && draftLastSavedAt && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{draftLabel}</p>}

            <section className="space-y-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold"><CalendarIcon className="h-5 w-5 text-primary" />Date & Time</h3>
              <ScrollArea className="w-full whitespace-nowrap pb-2"><div className="flex gap-2">{dateRange.map((date) => (
                <button type="button" key={date.toISOString()} onClick={() => setSelectedDate(date)} className={cn("w-20 rounded-lg border-2 p-3", isSameDay(selectedDate, date) ? "border-primary bg-primary/10" : "border-border/50")}>
                  <p className="text-sm font-medium">{format(date, "EEE")}</p><p className="text-2xl font-bold">{format(date, "d")}</p>
                </button>
              ))}</div></ScrollArea>
              {blockedDates.has(format(selectedDate, "yyyy-MM-dd")) && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">This date is blacked out in Availability & Policies.</p>}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {availableSlots.length ? availableSlots.map((slot) => {
                  const blocked = isSlotBlocked(slot) || isSlotTooSoon(slot);
                  return <Button key={slot} type="button" variant={formData.scheduled_time === slot ? "default" : "outline"} disabled={blocked && !overrideAvailability} onClick={() => setFormData((previous) => ({ ...previous, scheduled_time: slot }))} className={cn(blocked && "line-through opacity-60")}>{formatTime(slot)}</Button>;
                }) : <p className="col-span-full text-center text-sm text-muted-foreground">No bookable slots on this day.</p>}
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={overrideAvailability} onCheckedChange={(value) => setOverrideAvailability(value === true)} />Override availability for this staff-created appointment</label>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5 text-primary" />Customer</h3><Button type="button" variant="outline" size="sm" onClick={() => setCreatingCustomer((value) => !value)}><Plus className="mr-1 h-4 w-4" />New Customer</Button></div>
              {creatingCustomer ? <div className="space-y-3 rounded-lg border p-4">
                <Input placeholder="Customer name" value={newCustomer.name} onChange={(e) => setNewCustomer((v) => ({ ...v, name: e.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Email" type="email" value={newCustomer.email} onChange={(e) => setNewCustomer((v) => ({ ...v, email: e.target.value }))} /><Input placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer((v) => ({ ...v, phone: formatPhoneInput(e.target.value) }))} /></div>
                <Button type="button" onClick={createCustomer}>Create & Select Customer</Button>
              </div> : <>
                <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search customer by name, email, or phone" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} /></div>
                <Select value={formData.customer_id || ""} onValueChange={selectCustomer}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{filteredCustomers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</SelectItem>)}</SelectContent></Select>
              </>}
              {selectedCustomer && <div className="grid gap-2 sm:grid-cols-2"><Input value={formData.guest_email || ""} onChange={(e) => setFormData((v) => ({ ...v, guest_email: e.target.value }))} placeholder="Email" /><Input value={formData.guest_phone || ""} onChange={(e) => setFormData((v) => ({ ...v, guest_phone: formatPhoneInput(e.target.value) }))} placeholder="Phone" /></div>}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-lg font-semibold"><Car className="h-5 w-5 text-primary" />Vehicle</h3>{formData.customer_id && <Button type="button" variant="outline" size="sm" onClick={() => setCreatingVehicle((value) => !value)}><Plus className="mr-1 h-4 w-4" />New Vehicle</Button>}</div>
              {!formData.customer_id ? <p className="text-sm text-muted-foreground">Select a customer first.</p> : customerVehicles.length === 1 && !creatingVehicle ? <div className="rounded-lg border bg-muted/30 p-3 text-sm font-medium">{customerVehicles[0].year} {customerVehicles[0].make} {customerVehicles[0].model}{customerVehicles[0].license_plate ? ` · ${customerVehicles[0].license_plate}` : ""}</div> : customerVehicles.length > 1 && !creatingVehicle ? <Select value={formData.vehicle_id || ""} onValueChange={selectVehicle}><SelectTrigger><SelectValue placeholder="Select one of this customer's vehicles" /></SelectTrigger><SelectContent>{customerVehicles.map((vehicle) => <SelectItem key={vehicle.id} value={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model}{vehicle.license_plate ? ` (${vehicle.license_plate})` : ""}</SelectItem>)}</SelectContent></Select> : <div className="space-y-3 rounded-lg border p-4">
                <VehicleYMMSelector value={{ year: newVehicle.year, make: newVehicle.make, model: newVehicle.model }} onChange={(value) => setNewVehicle((v) => ({ ...v, year: value.year, make: value.make, model: value.model }))} />
                <div className="grid gap-3 sm:grid-cols-2"><Input placeholder="License plate" value={newVehicle.license_plate} onChange={(e) => setNewVehicle((v) => ({ ...v, license_plate: e.target.value }))} /><Input placeholder="VIN (optional)" value={newVehicle.vin} onChange={(e) => setNewVehicle((v) => ({ ...v, vin: e.target.value.toUpperCase() }))} /></div>
                <Button type="button" onClick={createVehicle}>Create & Select Vehicle</Button>
              </div>}
            </section>

            <section className="space-y-4">
              <h3 className="flex items-center gap-2 text-lg font-semibold"><DollarSign className="h-5 w-5 text-primary" />Service</h3>
              <Select value={formData.service_catalog_id || ""} onValueChange={chooseService}><SelectTrigger><SelectValue placeholder="Select an active service" /></SelectTrigger><SelectContent>{serviceCatalog.map((service) => <SelectItem key={service.id} value={service.id}>{service.name} · ${formatMoney(Number(service.default_price || 0))}{service.estimated_duration ? ` · ${service.estimated_duration} min` : ""}</SelectItem>)}</SelectContent></Select>
              {formData.service_catalog_id && <div className="grid gap-3 sm:grid-cols-2"><div><Label>Duration (minutes)</Label><Input type="number" min={5} value={formData.duration_minutes || ""} onChange={(e) => setFormData((v) => ({ ...v, duration_minutes: Number(e.target.value) }))} /></div><div><Label>Estimate ($)</Label><Input type="number" step="0.01" min={0} value={formData.estimated_cost ?? ""} onChange={(e) => setFormData((v) => ({ ...v, estimated_cost: Number(e.target.value) }))} /></div></div>}
            </section>

            {!isEditing && formData.guest_email && <label className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4"><Checkbox checked={sendEmailNotification} onCheckedChange={(checked) => setSendEmailNotification(checked === true)} /><span><span className="block text-sm font-medium">Send confirmation email</span><span className="text-xs text-muted-foreground">Send to {formData.guest_email}</span></span></label>}

            <section className="space-y-2"><Label>Internal Notes</Label><Textarea value={formData.notes || ""} onChange={(e) => setFormData((v) => ({ ...v, notes: e.target.value }))} placeholder="Special instructions, access notes, or internal context" /></section>
          </form>
        </ScrollArea>

        <DialogFooter className="flex flex-col border-t p-4">
          <div className="flex w-full items-center justify-between text-lg font-bold"><span>Total Estimate</span><span>${formatMoney(bankersRound(Number(formData.estimated_cost || 0), 2))}</span></div>
          <Button form="appointment-form" type="submit" size="lg" className="w-full gap-2" disabled={saving}>{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CalendarIcon className="h-5 w-5" />}{isEditing ? "Update Appointment" : "Schedule Appointment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
