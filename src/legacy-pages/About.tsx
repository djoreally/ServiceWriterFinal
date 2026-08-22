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
  { value: "100%", label: "Mobile-first" },
  { value: "Offline", label: "PWA-native" },
  { value: "USA", label: "Built & supported" },
  { value: "1", label: "Platform replaces 6 tools" },
];

export default function About() {
  return (
    <MarketingLayout>
      <PageHeader
        eyebrow="About"
        title="Spiffy is for dealerships. We're for everyone else."
        subtitle="Service Writer was started by operators tired of duct-taping scheduling apps, SMS tools, invoicing, and CRMs together to run a real mobile service business."
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
          Built in the van, not the boardroom.
        </h2>
        <div className="space-y-4 text-lg leading-relaxed" style={{ color: "#3a3a3a" }}>
          <p>
            The big dealer-group tools have been chasing one customer for a decade: the franchise dealership.
            Meanwhile the independent shops, the mobile mechanics, and the fleet service teams who actually keep
            America's cars moving have been stuck with desktop software designed for a service counter that
            doesn't exist in their world.
          </p>
          <p>
            Service Writer is what we wished we had. Mobile-first. Offline-first. A real operating system for
            dispatching, doing the work, billing for it, and bringing customers back.
          </p>
          <p>
            We are a small, senior team based in the United States. We reply quickly, ride along, and ship every week.
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
