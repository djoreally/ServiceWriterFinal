
import { useState, useEffect, useMemo } from 'react';
import { Appointment, Customer, Vehicle, ServiceCatalogItem, BusinessHours } from "@/shared/types";
import type { AppointmentFormState, CustomerFormData, VehicleFormData } from "@/shared/types/forms";
import { Button } from '@/components/ui/button';import { normalizePhoneToE164, formatPhoneInput } from "@/lib/phone";import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { format, parse, parseISO, addDays, isSameDay, addMinutes, setHours, setMinutes, isBefore, addHours } from 'date-fns';
import { cn } from '@/lib/utils';
import { Loader2, Calendar as CalendarIcon, Car, Users, DollarSign } from 'lucide-react';
import { VehicleYMMSelector } from "@/components/vehicles/VehicleYMMSelector";
import { useRegionalSettings } from '@/contexts/RegionalSettingsContext';
import { bankersRound, formatMoney } from "@/lib/financialMath";
import { fetchBookedSlots } from "@/application/queries/availability.query";
import { useFormAutoSave } from '@/hooks/useFormAutoSave';

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
  /** Owner user id — required to fetch real booked slots so the admin form
   *  shares the same source of truth as the public booking flow. */
  businessUserId?: string;
}

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
  onCreateCustomer,
  onCreateVehicle,
  businessUserId,
}: AppointmentFormProps) => {
  const { formatTime } = useRegionalSettings();
  const [formData, setFormData] = useState<AppointmentFormState>({});
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<Array<{ scheduled_time: string; duration_minutes: number }>>([]);
  const [overrideAvailability, setOverrideAvailability] = useState(false);
  const [sendEmailNotification, setSendEmailNotification] = useState(false);
  const draftKey = `appointment-form-draft:${isEditing ? (initialData as { id?: string } | null | undefined)?.id ?? 'editing' : 'new'}`;
  const { clear: clearDraft, label: draftLabel, lastSavedAt: draftLastSavedAt, restore: restoreDraft } = useFormAutoSave({
    key: draftKey,
    value: formData,
    enabled: open && Object.keys(formData).length > 0,
  });

  // Memoize date range for calendar
  const dateRange = useMemo(() => {
      const today = new Date();
      return Array.from({ length: 14 }, (_, i) => addDays(today, i));
  }, []);

  // Sanitize a value — convert undefined/null/'undefined' to empty string for form fields
  const toSafeStr = (val: unknown): string => {
    if (val == null) return '';
    const s = String(val).trim();
    return (s === 'undefined' || s === 'null') ? '' : s;
  };

  // Initialize form data when initialData changes
  useEffect(() => {
    if (initialData) {
      const date = initialData.scheduled_date ? parseISO(initialData.scheduled_date) : new Date();
      // Cast to any to access raw DB id fields (vehicle_id, customer_id) which exist at runtime
      // but are not on the Appointment type (which uses relations). Sanitize to prevent "undefined" UUID errors.
      const raw = initialData as Record<string, unknown>;
      setFormData({
        ...initialData,
        vehicle_id: toSafeStr(raw.vehicle_id) || undefined,
        customer_id: toSafeStr(raw.customer_id) || undefined,
        service_catalog_id: toSafeStr(raw.service_catalog_id) || undefined,
      } as AppointmentFormState);
      setSelectedDate(date);
    } else {
      const restored = restoreDraft();
      setFormData(restored ?? {
        status: 'confirmed',
        duration_minutes: 60,
        scheduled_time: '09:00',
        scheduled_date: format(new Date(), 'yyyy-MM-dd')
      });
      setSelectedDate(new Date());
    }
  }, [initialData, open, restoreDraft]);

  // Normalize "HH:mm" or "HH:mm:ss" → "HH:mm" so date-fns parse never breaks the grid.
  const toHHMM = (t: string | null | undefined): string => {
    if (!t) return '';
    const trimmed = String(t).trim();
    const m = /^(\d{1,2}):(\d{2})/.exec(trimmed);
    if (!m) return trimmed;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  };

  // Generate time slots based on business hours + the configured slot increment.
  const generateTimeSlots = (opening: string, closing: string, interval: number) => {
      const slots: string[] = [];
      const open = toHHMM(opening) || '08:00';
      const close = toHHMM(closing) || '17:00';
      const safeInterval = interval && interval > 0 ? interval : 30;
      const currentTime = parse(open, 'HH:mm', new Date());
      const closingTime = parse(close, 'HH:mm', new Date());

      while (currentTime < closingTime) {
          slots.push(format(currentTime, 'HH:mm'));
          currentTime.setMinutes(currentTime.getMinutes() + safeInterval);
      }
      return slots;
  };

  useEffect(() => {
    const dayName = format(selectedDate, 'EEEE');
    if (businessHours.working_days.includes(dayName)) {
      setAvailableSlots(generateTimeSlots(
        businessHours.opening_time,
        businessHours.closing_time,
        businessHours.slot_duration_minutes ?? 30,
      ));
    } else {
      setAvailableSlots([]);
    }
    setFormData((prev) => ({ ...prev, scheduled_date: format(selectedDate, 'yyyy-MM-dd') }));
  }, [selectedDate, businessHours]);

  // Fetch the same booked-slot data the public booking flow uses, so the admin
  // grid is grounded in the system's source of truth.
  useEffect(() => {
    if (!open || !businessUserId) {
      setBookedSlots([]);
      return;
    }
    let cancelled = false;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    (async () => {
      const data = await fetchBookedSlots(businessUserId, dateStr).catch((): Awaited<ReturnType<typeof fetchBookedSlots>> => []);
      if (cancelled) return;
      const editingId = (initialData as { id?: string } | null | undefined)?.id;
      const rows = data
        .filter((r) => !editingId || r.id !== editingId);
      setBookedSlots(rows);
    })();
    return () => { cancelled = true; };
  }, [open, businessUserId, selectedDate, initialData]);

  // Determine if a slot collides with an existing appointment (respecting buffers + duration).
  const isSlotBooked = (slotTime: string): boolean => {
    if (bookedSlots.length === 0) return false;
    const duration = Number(formData.duration_minutes) || 60;
    const bufferBefore = businessHours.buffer_time_before ?? 0;
    const bufferAfter = businessHours.buffer_time_after ?? 0;
    const slotStart = parse(slotTime, 'HH:mm', new Date());
    const slotEnd = addMinutes(slotStart, duration);
    for (const b of bookedSlots) {
      const bookedTime = toHHMM(b.scheduled_time);
      if (!bookedTime) continue;
      const bookedStart = parse(bookedTime, 'HH:mm', new Date());
      const blockedStart = addMinutes(bookedStart, -bufferBefore);
      const blockedEnd = addMinutes(addMinutes(bookedStart, b.duration_minutes || 60), bufferAfter);
      if (slotStart < blockedEnd && slotEnd > blockedStart) return true;
    }
    return false;
  };

  const isSlotTooSoon = (slotTime: string): boolean => {
    const lead = businessHours.min_lead_time_hours ?? 0;
    if (lead <= 0) return false;
    const [h, m] = slotTime.split(':').map(Number);
    const slotDateTime = setMinutes(setHours(selectedDate, h), m);
    return isBefore(slotDateTime, addHours(new Date(), lead));
  };

  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData({ ...formData, [name]: value });

    if (name === 'service_catalog_id' && value) {
      const selectedService = serviceCatalog.find(s => s.id === value);
      if (selectedService) {
        setFormData((prev) => ({
          ...prev,
          title: selectedService.name,
          estimated_cost: selectedService.default_price,
          duration_minutes: selectedService.estimated_duration || 60,
        }));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhoneToE164(formData.guest_phone || "");
    clearDraft();
    onSubmit({ ...formData, guest_phone: normalized || formData.guest_phone, sendEmailNotification });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl h-full max-h-full flex flex-col p-0 bg-card">
        <DialogHeader className="p-4 border-b">
          <div className="flex justify-between items-center">
             <DialogClose asChild>
                <Button variant="ghost">Close</Button>
            </DialogClose>
            <DialogTitle className="text-lg font-semibold">
              {isEditing ? 'Edit Appointment' : 'New Appointment'}
            </DialogTitle>
            <Button form="appointment-form" type="submit" disabled={saving} variant="ghost" className="text-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Save'}
            </Button>
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          <form id="appointment-form" onSubmit={handleSubmit} className="p-6 space-y-8">
            {!isEditing && draftLastSavedAt && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{draftLabel}</p>
            )}
            {/* Date & Time */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-primary" />
                Date & Time
              </h3>
              <ScrollArea className="w-full whitespace-nowrap pb-2">
                  <div className="flex gap-2">
                      {dateRange.map(date => (
                          <button type="button" key={date.toString()} onClick={() => setSelectedDate(date)} className={cn("p-3 rounded-lg border-2 transition-colors w-20", isSameDay(selectedDate, date) ? "border-primary bg-primary/10" : "border-border/50 bg-card hover:bg-muted/50")}>
                              <p className="text-sm font-medium">{format(date, 'EEE')}</p>
                              <p className="text-2xl font-bold">{format(date, 'd')}</p>
                          </button>
                      ))}
                  </div>
              </ScrollArea>
              
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {availableSlots.length > 0 ? availableSlots.map(slot => {
                  const booked = isSlotBooked(slot);
                  const tooSoon = isSlotTooSoon(slot);
                  const blocked = booked || tooSoon;
                  const disabled = blocked && !overrideAvailability;
                  const isSelected = formData.scheduled_time === slot;
                  return (
                    <Button
                      key={slot}
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                      onClick={() => handleSelectChange('scheduled_time', slot)}
                      disabled={disabled}
                      title={booked ? 'Slot already booked' : tooSoon ? 'Inside minimum lead time' : undefined}
                      className={cn(
                        "w-full",
                        blocked && !isSelected && "line-through opacity-60",
                      )}
                    >
                      {formatTime(slot)}
                    </Button>
                  );
                }) : <p className="col-span-full text-center text-muted-foreground">No slots available on this day.</p>}
              </div>
              {(bookedSlots.length > 0 || (businessHours.min_lead_time_hours ?? 0) > 0) && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={overrideAvailability}
                    onCheckedChange={(c) => setOverrideAvailability(c === true)}
                  />
                  Override availability (allow booking on conflicting / restricted slots)
                </label>
              )}
            </div>

            {/* Title is auto-populated from the selected service — no manual entry needed */}

            {/* Customer Details */}
            <div className="space-y-4">
               <h3 className="font-semibold text-lg flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Customer Details</h3>
               {/* Customer Select / Create to be added here */}
                 <Input 
                  name="guest_name"
                  value={formData.guest_name || ''}
                  onChange={handleInputChange}
                  placeholder="Full Name"
                  className="text-base"/>
                 <Input 
                  name="guest_phone"
                  type="tel"
                  value={formData.guest_phone || ''}
                  onChange={(e) => {
                    const formatted = formatPhoneInput(e.target.value);
                    setFormData({ ...formData, guest_phone: formatted });
                  }}
                  placeholder="(555) 123-4567"
                  className="text-base"/>
                 <Input 
                  name="guest_email"
                  value={formData.guest_email || ''}
                  onChange={handleInputChange}
                  placeholder="Email"
                  className="text-base"/>
            </div>

            {/* Vehicle Information */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2"><Car className="w-5 h-5 text-primary"/>Vehicle Information</h3>
              
              {/* Vehicle Select Dropdown */}
              {vehicles.length > 0 && (
                <Select 
                  value={formData.vehicle_id || ''} 
                  onValueChange={(v) => {
                    if (v === '__manual__') {
                      // Use empty string, not undefined, to avoid "undefined" UUID errors
                      setFormData(prev => ({ ...prev, vehicle_id: '' }));
                      return;
                    }
                    const selected = vehicles.find(vh => vh.id === v);
                    if (selected) {
                      setFormData(prev => ({
                        ...prev,
                        vehicle_id: selected.id,
                        vehicle_year: String(selected.year),
                        vehicle_make: selected.make,
                        vehicle_model: selected.model,
                        vehicle_license: selected.license_plate || '',
                      }));
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select an existing vehicle..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__manual__">— Enter manually —</SelectItem>
                    {vehicles.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.year} {v.make} {v.model}{v.license_plate ? ` (${v.license_plate})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <VehicleYMMSelector
                value={{
                  year: formData.vehicle_year != null ? String(formData.vehicle_year) : "",
                  make: formData.vehicle_make || "",
                  model: formData.vehicle_model || "",
                }}
                onChange={(v) => {
                  handleSelectChange('vehicle_year', v.year);
                  handleSelectChange('vehicle_make', v.make);
                  handleSelectChange('vehicle_model', v.model);
                }}
              />
              <Input name="vehicle_license" value={formData.vehicle_license || ''} onChange={handleInputChange} placeholder="License Plate"/>
            </div>

            {/* Service & Pricing */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2"><DollarSign className="w-5 h-5 text-primary"/>Service & Pricing</h3>
               <Select name="service_catalog_id" onValueChange={(v) => handleSelectChange('service_catalog_id', v)} value={formData.service_catalog_id || ''}>
                <SelectTrigger><SelectValue placeholder="Select a service..." /></SelectTrigger>
                <SelectContent>
                  {serviceCatalog.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span>{s.name}</span>
                      {s.default_price != null && (
                        <span className="ml-2 text-muted-foreground text-xs">${formatMoney(Number(s.default_price))}{s.estimated_duration ? ` · ${s.estimated_duration}min` : ''}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.service_catalog_id && (() => {
                const svc = serviceCatalog.find(s => s.id === formData.service_catalog_id);
                return svc ? (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                    {svc.description && <p className="text-muted-foreground">{svc.description}</p>}
                    <div className="flex justify-between font-medium pt-1">
                      <span>Estimated Cost</span>
                      <span>${formatMoney(Number(svc.default_price))}</span>
                    </div>
                    {svc.estimated_duration && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Duration</span>
                        <span>{svc.estimated_duration} min</span>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Duration (min)</label>
                  <Input name="duration_minutes" type="number" value={formData.duration_minutes || ''} onChange={handleInputChange} placeholder="60"/>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">Estimated Cost ($)</label>
                  <Input name="estimated_cost" type="number" value={formData.estimated_cost || ''} onChange={handleInputChange} placeholder="0.00"/>
                </div>
              </div>
            </div>

            {/* Email Notification - only show for new appointments */}
            {!isEditing && formData.guest_email && (
              <div className="flex items-center space-x-3 p-4 rounded-lg border bg-muted/30">
                <Checkbox 
                  id="sendEmailNotification" 
                  checked={sendEmailNotification}
                  onCheckedChange={(checked) => setSendEmailNotification(checked === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label 
                    htmlFor="sendEmailNotification" 
                    className="text-sm font-medium cursor-pointer"
                  >
                    Send confirmation email to customer
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    A confirmation email will be sent to {formData.guest_email}
                  </p>
                </div>
              </div>
            )}

            {/* Internal Notes */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Internal Notes (Optional)</h3>
              <Textarea name="notes" value={formData.notes || ''} onChange={handleInputChange} placeholder="Add any special instructions..." />
            </div>
          </form>
        </ScrollArea>
        
        <DialogFooter className="p-4 border-t flex flex-col space-y-2">
            <div className="flex justify-between items-center text-lg font-bold">
                <span>Total Estimate</span>
                <span>${formatMoney(bankersRound(Number(formData.estimated_cost || 0), 2))}</span>
            </div>
            <Button form="appointment-form" type="submit" size="lg" className="w-full gap-2" disabled={saving}>
                {saving ? <Loader2 className="w-5 h-5 animate-spin"/> : <CalendarIcon className="w-5 h-5" />}
                {isEditing ? 'Update Appointment' : 'Schedule Appointment'}
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
