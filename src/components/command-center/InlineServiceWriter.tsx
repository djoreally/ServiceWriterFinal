/**
 * InlineServiceWriter — The core operational panel for the Command Center.
 *
 * Multi-step inline workflow that replaces navigating away:
 *   Step 1: Customer lookup (search existing or quick-create)
 *   Step 2: Service selection from catalog + pricing
 *   Step 3: Schedule & address
 *   Step 4: Review & create job
 *
 * After creation, the job appears in the Queue tab for one-click dispatch.
 *
 * Performance: Catalog and customers are fetched once on mount, not per keystroke.
 */

import { errorMessage } from "@/lib/error-message";
import { useState, useEffect, useMemo, useCallback } from "react";
import { fetchServiceWriterData } from "@/application/queries/inline-service-writer.query";
import { createInlineCustomer, createInlineAppointment, insertAppointmentServiceItems } from "@/application/commands/inline-service-writer.command";
import { useAuth } from "@packages/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, ArrowRight, Search, UserPlus, Check,
  DollarSign, Clock, MapPin, Loader2, Zap, Plus, Minus,
  FileText, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";

// ─── Types ─────────────────────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  labor_rate: number | null;
  estimated_duration: number | null;
  category: string | null;
}

interface CustomerResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface SelectedService {
  catalogId: string;
  name: string;
  price: number;
  quantity: number;
  duration: number;
}

interface Props {
  onBack: () => void;
  onJobCreated: () => void;
}

type Step = "customer" | "service" | "schedule" | "review";

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "customer", label: "Customer", icon: <Search className="h-3.5 w-3.5" /> },
  { key: "service", label: "Service", icon: <FileText className="h-3.5 w-3.5" /> },
  { key: "schedule", label: "Schedule", icon: <Clock className="h-3.5 w-3.5" /> },
  { key: "review", label: "Review", icon: <Send className="h-3.5 w-3.5" /> },
];

export function InlineServiceWriter({ onBack, onJobCreated }: Props) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  // Step state
  const [step, setStep] = useState<Step>("customer");
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [customers, setCustomers] = useState<CustomerResult[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Step 1: Customer
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "" });

  // Step 2: Services
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");

  // Step 3: Schedule
  const [scheduledDate, setScheduledDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");

  // Fetch catalog + customers once
  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const [catRes, custRes] = await fetchServiceWriterData(userId);
      if (catRes.data) setCatalog(catRes.data);
      if (custRes.data) setCustomers(custRes.data);
      setLoadingData(false);
    };
    load();
  }, [userId]);

  // Filtered lists
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 20);
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    ).slice(0, 20);
  }, [customers, customerSearch]);

  const filteredCatalog = useMemo(() => {
    if (!catalogSearch.trim()) return catalog;
    const q = catalogSearch.toLowerCase();
    return catalog.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.category?.toLowerCase().includes(q)
    );
  }, [catalog, catalogSearch]);

  // Group catalog by category
  const catalogByCategory = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    filteredCatalog.forEach(item => {
      const cat = item.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    });
    return map;
  }, [filteredCatalog]);

  // Totals
  const totalPrice = useMemo(() => selectedServices.reduce((sum, s) => sum + s.price * s.quantity, 0), [selectedServices]);
  const totalDuration = useMemo(() => selectedServices.reduce((sum, s) => sum + s.duration * s.quantity, 0), [selectedServices]);

  // Toggle service selection
  const toggleService = useCallback((item: CatalogItem) => {
    setSelectedServices(prev => {
      const existing = prev.find(s => s.catalogId === item.id);
      if (existing) return prev.filter(s => s.catalogId !== item.id);
      return [...prev, {
        catalogId: item.id,
        name: item.name,
        price: item.default_price,
        quantity: 1,
        duration: item.estimated_duration || 30,
      }];
    });
  }, []);

  const updateQuantity = useCallback((catalogId: string, delta: number) => {
    setSelectedServices(prev => prev.map(s =>
      s.catalogId === catalogId ? { ...s, quantity: Math.max(1, s.quantity + delta) } : s
    ));
  }, []);

  // Navigation
  const stepIndex = STEPS.findIndex(s => s.key === step);
  const canNext = (): boolean => {
    switch (step) {
      case "customer": return !!(selectedCustomer || (isNewCustomer && newCustomer.name.trim()));
      case "service": return selectedServices.length > 0;
      case "schedule": return !!scheduledDate && !!scheduledTime;
      default: return true;
    }
  };

  const goNext = () => {
    const idx = stepIndex + 1;
    if (idx < STEPS.length) setStep(STEPS[idx].key);
  };
  const goBack = () => {
    const idx = stepIndex - 1;
    if (idx >= 0) setStep(STEPS[idx].key);
    else onBack();
  };

  // Submit — create appointment + services
  const handleSubmit = async () => {
    if (!userId) return;
    setSubmitting(true);
    try {
      // Resolve customer
      let customerId: string | null = selectedCustomer?.id ?? null;
      const guestName = selectedCustomer?.name ?? newCustomer.name;
      const guestEmail = selectedCustomer?.email ?? newCustomer.email;
      const guestPhone = selectedCustomer?.phone ?? newCustomer.phone;

      // Create new customer if needed
      if (isNewCustomer && newCustomer.name.trim()) {
        const { data: newCust, error: custErr } = await createInlineCustomer(userId, {
          name: newCustomer.name,
          email: newCustomer.email || null,
          phone: newCustomer.phone || null,
        });
        if (custErr) throw custErr;
        customerId = newCust.id;
      }

      // Create appointment
      const title = selectedServices.map(s => s.name).join(", ");
      const { data: appt, error: apptErr } = await createInlineAppointment({
        user_id: userId,
        title: title.length > 100 ? title.slice(0, 97) + "..." : title,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
        duration_minutes: totalDuration || 60,
        customer_id: customerId,
        guest_name: guestName || null,
        guest_email: guestEmail || null,
        guest_phone: guestPhone || null,
        location_address: address || null,
        estimated_cost: totalPrice,
        job_priority: priority,
        notes: notes || null,
        status: "scheduled",
        source: "command_center",
        service_catalog_id: selectedServices[0]?.catalogId || null,
      });

      if (apptErr) throw apptErr;

      // Insert service line items
      if (selectedServices.length > 0) {
        const lineItems = selectedServices.map(s => ({
          appointment_id: appt.id,
          service_catalog_id: s.catalogId,
          name: s.name,
          price: s.price,
          quantity: s.quantity,
        }));
        await insertAppointmentServiceItems(lineItems);
      }

      toast.success("Job created — ready for dispatch");
      onJobCreated();
    } catch (err: unknown) {
      console.error("Job creation error:", err);
      toast.error(errorMessage(err, "Failed to create job"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingData) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Step indicator */}
      <div className="px-4 pt-3 pb-2 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <Button variant="ghost" size="sm" className="gap-1 text-xs h-7" onClick={goBack}>
            <ArrowLeft className="h-3 w-3" /> {stepIndex === 0 ? "Cancel" : "Back"}
          </Button>
          <span className="text-xs font-medium text-muted-foreground">
            New Job — Step {stepIndex + 1}/{STEPS.length}
          </span>
        </div>
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                "flex-1 h-1 rounded-md transition-colors",
                i <= stepIndex ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <ScrollArea className="flex-1 px-4 py-3">
        {/* ─── STEP 1: CUSTOMER ─── */}
        {step === "customer" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Who's the customer?</h3>
              <Button
                variant={isNewCustomer ? "default" : "outline"}
                size="sm"
                className="gap-1 text-xs h-7"
                onClick={() => { setIsNewCustomer(!isNewCustomer); setSelectedCustomer(null); }}
              >
                <UserPlus className="h-3 w-3" />
                {isNewCustomer ? "Search existing" : "New customer"}
              </Button>
            </div>

            {isNewCustomer ? (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Name *</Label>
                  <Input
                    value={newCustomer.name}
                    onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))}
                    placeholder="Customer name"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input
                      value={newCustomer.email}
                      onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))}
                      placeholder="email@example.com"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input
                      value={newCustomer.phone}
                      onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))}
                      placeholder="(555) 123-4567"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    placeholder="Search by name, email, or phone…"
                    className="h-8 text-sm pl-8"
                  />
                </div>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md border text-sm transition-colors",
                        selectedCustomer?.id === c.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-accent"
                      )}
                      onClick={() => setSelectedCustomer(c)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.name}</span>
                        {selectedCustomer?.id === c.id && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"}
                      </p>
                    </button>
                  ))}
                  {filteredCustomers.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No customers found. Try a different search or create a new customer.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── STEP 2: SERVICE SELECTION ─── */}
        {step === "service" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Select services</h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={catalogSearch}
                onChange={e => setCatalogSearch(e.target.value)}
                placeholder="Search catalog…"
                className="h-8 text-sm pl-8"
              />
            </div>

            {/* Selected services summary */}
            {selectedServices.length > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-md px-3 py-2 space-y-1">
                {selectedServices.map(s => (
                  <div key={s.catalogId} className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate flex-1">{s.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => updateQuantity(s.catalogId, -1)} className="h-5 w-5 rounded bg-muted flex items-center justify-center hover:bg-accent">
                        <Minus className="h-2.5 w-2.5" />
                      </button>
                      <span className="w-4 text-center">{s.quantity}</span>
                      <button onClick={() => updateQuantity(s.catalogId, 1)} className="h-5 w-5 rounded bg-muted flex items-center justify-center hover:bg-accent">
                        <Plus className="h-2.5 w-2.5" />
                      </button>
                      <span className="text-muted-foreground w-14 text-right">${(s.price * s.quantity).toFixed(0)}</span>
                    </div>
                  </div>
                ))}
                <Separator className="my-1" />
                <div className="flex justify-between text-xs font-semibold">
                  <span>Total</span>
                  <span>${totalPrice.toFixed(2)} · {totalDuration}min</span>
                </div>
              </div>
            )}

            {/* Catalog grouped by category */}
            <div className="space-y-3 max-h-[250px] overflow-y-auto">
              {Array.from(catalogByCategory.entries()).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">{cat}</p>
                  <div className="space-y-1">
                    {items.map(item => {
                      const isSelected = selectedServices.some(s => s.catalogId === item.id);
                      return (
                        <button
                          key={item.id}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-md border text-sm transition-colors",
                            isSelected ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                          )}
                          onClick={() => toggleService(item)}
                        >
                          <div className="flex items-center justify-between">
                            <span className={cn("font-medium text-xs", isSelected && "text-primary")}>{item.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{item.estimated_duration || 30}min</span>
                              <span className="text-xs font-semibold">${item.default_price}</span>
                              {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {catalog.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No services in catalog. Add services in Settings first.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── STEP 3: SCHEDULE ─── */}
        {step === "schedule" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">When & where?</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Date *</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Time *</Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Service Address</Label>
              <Input
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="123 Main St, City, State"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  size="sm"
                  variant={priority === "normal" ? "default" : "outline"}
                  className="text-xs h-7"
                  onClick={() => setPriority("normal")}
                >
                  Normal
                </Button>
                <Button
                  size="sm"
                  variant={priority === "urgent" ? "destructive" : "outline"}
                  className="text-xs h-7"
                  onClick={() => setPriority("urgent")}
                >
                  ⚡ Urgent
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Special instructions, gate codes, etc."
                className="text-sm min-h-[60px]"
                rows={2}
              />
            </div>
          </div>
        )}

        {/* ─── STEP 4: REVIEW ─── */}
        {step === "review" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Review & Create Job</h3>

            {/* Customer */}
            <div className="bg-muted/30 rounded-md px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">Customer</p>
              <p className="text-sm font-medium">{selectedCustomer?.name || newCustomer.name || "Walk-in"}</p>
              <p className="text-[10px] text-muted-foreground">
                {selectedCustomer?.email || newCustomer.email || "No email"}
                {" · "}
                {selectedCustomer?.phone || newCustomer.phone || "No phone"}
              </p>
            </div>

            {/* Services */}
            <div className="bg-muted/30 rounded-md px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Services</p>
              {selectedServices.map(s => (
                <div key={s.catalogId} className="flex justify-between text-xs py-0.5">
                  <span>{s.name} × {s.quantity}</span>
                  <span className="font-medium">${(s.price * s.quantity).toFixed(2)}</span>
                </div>
              ))}
              <Separator className="my-1" />
              <div className="flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>
            </div>

            {/* Schedule */}
            <div className="bg-muted/30 rounded-md px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">Schedule</p>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {scheduledDate} at {scheduledTime}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {totalDuration}min</span>
              </div>
              {address && (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="h-2.5 w-2.5" /> {address}
                </p>
              )}
              {priority === "urgent" && (
                <Badge variant="destructive" className="text-[10px] mt-1">⚡ Urgent</Badge>
              )}
            </div>

            {notes && (
              <div className="bg-muted/30 rounded-md px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-0.5">Notes</p>
                <p className="text-xs">{notes}</p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer actions */}
      <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {selectedServices.length > 0 && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              ${totalPrice.toFixed(0)} · {totalDuration}min
            </span>
          )}
        </div>
        {step === "review" ? (
          <Button size="sm" className="gap-1.5" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Create Job
          </Button>
        ) : (
          <Button size="sm" className="gap-1" onClick={goNext} disabled={!canNext()}>
            Next <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
