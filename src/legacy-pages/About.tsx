import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  MarketingLayout,
  PageHeader,
  NeoCard,
  neoBtn,
  hardShadow,
  hankenStack,
  monoStack,
  PRIMARY,
  PRIMARY_CONTAINER,
} from "@/components/marketing/MarketingLayout";

const STATS = [
  { value: "Shop", label: "Operator-built" },
  { value: "$0", label: "Operational core" },
  { value: "1", label: "Customer-to-payment workflow" },
  { value: "Your Data", label: "Not an upgrade hostage" },
];

export default function About() {
  return (
    <MarketingLayout>
      <PageHeader
        eyebrow="About"
        title="Built by a shop, for shops."
        subtitle="Service Writer comes from operating an automotive service business and dealing with the same scheduling, vehicle, technician, inspection, authorization, payment, and retention problems the software is built to solve."
      />

      <div className="grid md:grid-cols-4 gap-5 mb-20">
        {STATS.map((s) => (
          <NeoCard key={s.label} className="text-center">
            <div className="text-4xl font-black mb-1" style={hankenStack}>{s.value}</div>
            <div className="text-xs uppercase tracking-widest" style={{ ...monoStack, color: PRIMARY }}>
              {s.label}
            </div>
          </NeoCard>
        ))}
      </div>

      <NeoCard className="mb-12">
        <div className="text-xs uppercase tracking-widest mb-3" style={{ ...monoStack, color: PRIMARY }}>
          Our story
        </div>
        <h2 className="text-3xl font-black mb-6" style={hankenStack}>
          The product started with the work.
        </h2>
        <div className="space-y-4 text-lg leading-relaxed" style={{ color: "#3a3a3a" }}>
          <p>
            Service Writer was shaped by the day-to-day reality of running automotive service: customers book, vehicles have histories, technicians need the right information at the right time, inspections uncover additional work, customers must authorize it, and every completed service has to become an accurate invoice and permanent vehicle record.
          </p>
          <p>
            That is why the product is organized around the complete service lifecycle instead of disconnected software modules. The non-fleet appointment carries the work from schedule through execution and payment. The exact vehicle stays attached. Inspection findings can become recommendations. Customer decisions remain part of the record. Completed and deferred work become useful history.
          </p>
          <p>
            The business model follows the same operator-first logic: the everyday operational core is free. Service Writer earns more when advanced automation, growth products, infrastructure, or fleet capabilities create additional value — not by putting artificial limits on ordinary customers, vehicles, technicians, or service records.
          </p>
        </div>
      </NeoCard>

      <NeoCard className="text-center">
        <h2 className="text-3xl font-black mb-6" style={hankenStack}>
          Want to see it in action?
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
