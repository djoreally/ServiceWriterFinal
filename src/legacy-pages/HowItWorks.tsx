import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CarFront, CheckCircle2, ClipboardCheck, CreditCard, FileCheck2, Gauge, History, SearchCheck, Wrench } from "lucide-react";
import {
  MarketingLayout,
  PageHeader,
  NeoCard,
  neoBtn,
  hardShadow,
  hankenStack,
  monoStack,
  PRIMARY_CONTAINER,
  PRIMARY,
} from "@/components/marketing/MarketingLayout";

const STEPS = [
  { icon: CalendarDays, title: "Request becomes an appointment", body: "A customer books online, calls, or the office creates the appointment. The appointment becomes the non-fleet operating record that carries the scheduled service forward." },
  { icon: CarFront, title: "Lock the work to the exact vehicle", body: "Customer, vehicle, requested services, pricing, VIN context, and history stay together. Multi-vehicle appointments preserve each vehicle's work separately." },
  { icon: FileCheck2, title: "Estimate and authorize scheduled work", body: "Build the expected service, price it, and capture customer approval so the technician starts with a clear authorized scope." },
  { icon: Gauge, title: "Start Job verifies VIN and mileage", body: "At service start, the technician confirms the exact vehicle, VIN, and mileage before moving into that service's required inspection." },
  { icon: SearchCheck, title: "Inspect while the service is underway", body: "The service-specific inspection begins at Start Job, so condition findings and upsell opportunities surface while the scheduled work is already moving." },
  { icon: ClipboardCheck, title: "Turn findings into recommendations", body: "Attention or urgent findings can become priced recommendations with technician context for that exact vehicle." },
  { icon: CheckCircle2, title: "Customer approves or declines", body: "Authorization is explicit. Approved additional work is added to the active appointment for the correct vehicle; declined work remains in history for future service." },
  { icon: Wrench, title: "Complete the authorized work", body: "Technicians finish scheduled and approved services. Anything that cannot be completed follows a clearly recorded unable-to-complete path instead of being falsely marked complete." },
  { icon: CreditCard, title: "Invoice, reconcile, and collect", body: "Completed work becomes the invoice. Prepaid amounts, additional authorized work, payment, and receipt are reconciled without losing vehicle-level attribution." },
  { icon: History, title: "History drives the next visit", body: "Completed and declined work stays with the customer and vehicle. That history can power reminders, loyalty, re-engagement, reviews, and future appointments." },
];

export default function HowItWorks() {
  return (
    <MarketingLayout>
      <PageHeader
        eyebrow="How it works"
        title="From appointment to inspection, authorization, payment, and the next visit."
        subtitle="The workflow follows the actual service job. For non-fleet work, the appointment is the operating record — not a second hidden work-order system."
      />

      <div className="space-y-8 mb-20">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <NeoCard key={title} className="relative">
            <div className="absolute top-4 right-6 text-xs uppercase tracking-widest opacity-60" style={monoStack}>
              #{String(i + 1).padStart(2, "0")}
            </div>
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <div
                className="w-16 h-16 border-[3px] border-black flex items-center justify-center shrink-0"
                style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}
              >
                <Icon className="w-8 h-8" strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-2xl font-black mb-3" style={hankenStack}>
                  {title}
                </h3>
                <p className="text-lg leading-relaxed" style={{ color: "#3a3a3a" }}>
                  {body}
                </p>
              </div>
            </div>
          </NeoCard>
        ))}
      </div>

      <NeoCard className="text-center">
        <div className="inline-block uppercase text-xs tracking-widest mb-4" style={{ ...monoStack, color: PRIMARY }}>
          Ready to switch?
        </div>
        <h2 className="text-4xl font-black mb-6" style={hankenStack}>
          Start a free account in under five minutes.
        </h2>
        <div className="flex flex-col md:flex-row justify-center gap-4">
          <Link to="/signup" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>
            Start free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/contact" className={neoBtn} style={{ backgroundColor: "#fff", ...hardShadow }}>
            Book demo
          </Link>
        </div>
      </NeoCard>
    </MarketingLayout>
  );
}
