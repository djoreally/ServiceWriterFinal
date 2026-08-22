import { Link } from "react-router-dom";
import { ArrowRight, Phone, ClipboardList, Wrench, CreditCard, Repeat } from "lucide-react";
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
  {
    icon: Phone,
    title: "Customer books or calls",
    body: "Inbound calls, web bookings, and SMS all land in one inbox. The AI receptionist captures details when you're on a job.",
  },
  {
    icon: ClipboardList,
    title: "Dispatch & route",
    body: "Drag-and-drop dispatch board with live ETA, geo-aware availability, and automatic SMS confirmations.",
  },
  {
    icon: Wrench,
    title: "Service in the field",
    body: "Offline-first PWA: technicians complete DVIs, take photos, scan VINs, and update job status with or without signal.",
  },
  {
    icon: CreditCard,
    title: "Invoice & collect",
    body: "Quote → invoice → Stripe or Square payment in one tap. Funds settle to your bank, ledger reconciled automatically.",
  },
  {
    icon: Repeat,
    title: "Bring them back",
    body: "Retention engine triggers maintenance reminders, review requests, and loyalty rewards based on the work history.",
  },
];

export default function HowItWorks() {
  return (
    <MarketingLayout>
      <PageHeader
        eyebrow="How it works"
        title="From first call to repeat customer — in one platform."
        subtitle="Service Writer replaces the patchwork of scheduling apps, SMS tools, invoicing, and CRMs that independent shops and fleets stitch together today."
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
