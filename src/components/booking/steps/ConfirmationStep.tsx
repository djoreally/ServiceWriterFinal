import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, parse, addHours } from "date-fns";
import type { VehicleData } from "@/components/booking/VehicleEntry";
import type { VehicleServiceSelection } from "@/hooks/useBookingState";

interface ConfirmationStepProps {
  businessName: string;
  guestEmail: string;
  vehicles: VehicleData[];
  vehicleServiceSelections: Record<string, VehicleServiceSelection>;
  selectedDate: Date | undefined;
  selectedTime: string;
  customerAddress: string;
  city: string;
  state: string;
  zipCode: string;
  paymentChoice: "pay_now" | "pay_later";
  formatCurrency: (amount: number) => string;
  getGrandTotal: () => number;
  quoteRequired?: boolean;
}

export function ConfirmationStep({ businessName, guestEmail, vehicles, vehicleServiceSelections, selectedDate, selectedTime, customerAddress, city, state, zipCode, paymentChoice, formatCurrency, getGrandTotal, quoteRequired = false }: ConfirmationStepProps) {
  const eventLocation = `${customerAddress}, ${city}, ${state} ${zipCode}`;
  const validVehicles = vehicles.filter((vehicle) => vehicle.year && vehicle.make && vehicle.model);
  const groupedDetails = validVehicles.map((vehicle) => {
    const selection = vehicleServiceSelections[vehicle.id];
    const services = selection?.package ? [`${selection.package.name} (${selection.package.services.map((service) => service.name).join(", ")})`] : (selection?.services || []).map((service) => service.name);
    const config = [
      vehicle.tireSize && `Tire fitment: ${vehicle.tireSize}${vehicle.rearTireSize ? ` / ${vehicle.rearTireSize}` : ""}`,
      vehicle.tireInventoryName && `Inventory: ${vehicle.tireInventoryName}${vehicle.tireInventorySku ? ` (${vehicle.tireInventorySku})` : ""}`,
      vehicle.tireFrontQuantity && `Quantity: ${vehicle.tireFrontQuantity + (vehicle.tireRearQuantity || 0)} tire(s)`,
      vehicle.detailingVehicleSize && `Detailing assessment: ${vehicle.detailingVehicleSize}, ${vehicle.detailingCondition || "condition pending"}`,
      vehicle.detailingHasWater !== undefined && `Site: ${vehicle.detailingHasWater ? "water" : "no water"}${vehicle.detailingHasPower ? ", power" : ""}${vehicle.detailingHasCoveredArea ? ", covered area" : ""}`,
      vehicle.oilType && `Oil: ${vehicle.oilType}${vehicle.oilCapacity ? `, ${vehicle.oilCapacity}` : ""}`,
    ].filter(Boolean) as string[];
    return { vehicle, services, config };
  });
  const vehicleInfo = groupedDetails.map(({ vehicle }) => `${vehicle.year} ${vehicle.make} ${vehicle.model}`).join(", ");
  const eventTitle = `${vehicleInfo || "Appointment"} – ${businessName}`;
  const eventDescription = groupedDetails.map(({ vehicle, services, config }) => `${vehicle.year} ${vehicle.make} ${vehicle.model}\nServices: ${services.join(", ") || "None"}\n${config.join("\n")}`).join("\n\n");
  const calDateFmt = (date: Date) => format(date, "yyyyMMdd'T'HHmmss");
  const calData = selectedDate && selectedTime ? (() => { const startDt = parse(selectedTime, "HH:mm", selectedDate); return { startDt, endDt: addHours(startDt, 1) }; })() : null;
  const googleUrl = calData ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventTitle)}&dates=${calDateFmt(calData.startDt)}/${calDateFmt(calData.endDt)}&details=${encodeURIComponent(eventDescription)}&location=${encodeURIComponent(eventLocation)}` : null;

  const handleAppleCalendar = () => {
    if (!calData) return;
    const icsContent = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BookYourOilChange//EN", "BEGIN:VEVENT", `DTSTART:${calDateFmt(calData.startDt)}`, `DTEND:${calDateFmt(calData.endDt)}`, `SUMMARY:${eventTitle}`, `DESCRIPTION:${eventDescription.replace(/\n/g, "\\n")}`, `LOCATION:${eventLocation}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([icsContent], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "appointment.ics"; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  return <div className="mx-auto max-w-lg text-center"><div className="mx-auto mb-6 w-fit rounded-md bg-success/20 p-6"><CheckCircle2 className="h-16 w-16 text-success" /></div><h1 className="mb-2 text-3xl font-bold">{quoteRequired ? "Request received" : "Booking Confirmed!"}</h1><p className="mb-2 text-muted-foreground">{quoteRequired ? "Your preferred appointment time and detailing assessment were submitted for provider review." : "Your appointment has been scheduled."} A confirmation email has been sent to {guestEmail}.</p><p className="mb-8 text-sm text-muted-foreground">Don't see it? Be sure to check your spam or junk folder.</p><Card><CardContent className="space-y-4 pt-6 text-left"><div className="space-y-3 rounded-lg bg-muted/50 p-4"><h3 className="font-semibold">Appointment Details</h3>{groupedDetails.map(({ vehicle, services, config }) => <div key={vehicle.id} className="rounded-md border bg-background p-3"><p className="font-medium">{vehicle.year} {vehicle.make} {vehicle.model}</p><p className="mt-1 text-sm"><span className="text-muted-foreground">Services:</span> {services.join(", ") || "None"}</p>{config.length > 0 && <div className="mt-2 space-y-1 text-xs text-muted-foreground">{config.map((item) => <p key={item}>{item}</p>)}</div>}</div>)}</div><p className="text-sm"><span className="text-muted-foreground">Date:</span> {selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}</p><p className="text-sm"><span className="text-muted-foreground">Time:</span> {selectedTime}</p><p className="text-sm"><span className="text-muted-foreground">Location:</span> {eventLocation}</p><div className="flex items-center justify-between border-t pt-4"><span className="font-semibold">{quoteRequired ? "Starting estimate" : "Total"}</span><span className="text-xl font-bold text-primary">{formatCurrency(getGrandTotal())}</span></div>{quoteRequired && <p className="text-sm text-amber-700">The provider will review the condition and site details, then confirm the final scope and price before work begins.</p>}{paymentChoice === "pay_later" && <p className="text-center text-sm text-muted-foreground">Payment will be collected at the time of service</p>}</CardContent></Card>{calData && <div className="mt-6 space-y-3"><p className="text-sm font-medium text-muted-foreground">Add to your calendar</p><div className="flex flex-col justify-center gap-3 sm:flex-row"><Button variant="outline" className="border-[#4285F4] text-[#4285F4] hover:bg-[#4285F4]/10 hover:text-[#4285F4]" onClick={() => window.open(googleUrl!, "_blank")}>Google Calendar</Button><Button variant="outline" onClick={handleAppleCalendar}>Apple Calendar</Button></div></div>}</div>;
}
