import { useState } from "react";
import { CalendarDays, Car, ChevronDown, MapPin, ReceiptText, Wrench } from "lucide-react";
import { format, parse } from "date-fns";
import { cn } from "@/lib/utils";
import type { VehicleData } from "@/components/booking/VehicleEntry";

interface AppointmentBarProps { vehicles: VehicleData[]; serviceName: string; selectedDate?: Date; selectedTime: string; address: string; total: string; }

export function AppointmentBar({ vehicles, serviceName, selectedDate, selectedTime, address, total }: AppointmentBarProps) {
  const [open, setOpen] = useState(false);
  const vehicle = vehicles.find((item) => item.year && item.make && item.model);
  const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Add your vehicle";
  const timeLabel = selectedDate ? `${format(selectedDate, "EEEE, MMM d")}${selectedTime ? ` at ${format(parse(selectedTime, "HH:mm", new Date()), "h:mm a")}` : ""}` : "Choose a date and time";
  return (
    <section className="fixed inset-x-0 bottom-16 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur" aria-label="Your appointment">
      <div className="mx-auto max-w-4xl px-4 py-3">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 text-left" aria-expanded={open}>
          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 sm:flex"><ReceiptText className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Your Appointment</p><p className="truncate text-sm font-semibold text-slate-900">{vehicleLabel} <span className="font-normal text-slate-400">•</span> {serviceName || "Select a service"}</p></div>
          <div className="text-right"><p className="text-xs text-slate-500">Current total</p><p className="font-bold text-slate-950">{total}</p></div>
          <span className="hidden text-xs font-medium text-blue-700 sm:inline">View details</span><ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform duration-200", open && "rotate-180")} />
        </button>
        <div className={cn("grid overflow-hidden transition-all duration-200", open ? "grid-rows-[1fr] pt-3" : "grid-rows-[0fr]")}><div className="min-h-0"><div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
          <p className="flex items-center gap-2"><Car className="h-4 w-4 text-blue-600" />{vehicleLabel}</p><p className="flex items-center gap-2"><Wrench className="h-4 w-4 text-blue-600" />{serviceName || "No service selected"}</p><p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-blue-600" />{timeLabel}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-blue-600" /><span className="truncate">{address || "Add service address"}</span></p>
        </div></div></div>
      </div>
    </section>
  );
}
