import { Link } from "react-router-dom";
import { Check, ArrowRight, CreditCard } from "lucide-react";
import {
  MarketingLayout,
  PageHeader,
  NeoCard,
  neoBtn,
  hardShadow,
  hardShadowLg,
  hankenStack,
  monoStack,
  PRIMARY,
  PRIMARY_CONTAINER,
} from "@/components/marketing/MarketingLayout";

const PLANS = [
  {
    name: "Basic",
    price: "$0",
    cadence: "forever",
    annual: "Free",
    blurb: "The core Service Writer workflow for solo operators and new businesses.",
    features: [
      "Customers and vehicles",
      "Appointments and scheduling",
      "Public booking",
      "Service catalog",
      "Basic invoicing and service records",
      "No Technician OS",
      "No Fleet OS",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Pro",
    price: "$99",
    cadence: "per month",
    annual: "$950.40/year with annual billing",
    blurb: "The full operating platform for growing service businesses and field teams.",
    features: [
      "Everything in Basic",
      "Technician OS",
      "Dispatch and field workflows",
      "Automation and operational tools",
      "3 technicians included",
      "$9.99/month per additional technician",
      "$95.90/year per additional technician on annual billing",
    ],
    cta: "Choose Pro",
    featured: true,
  },
  {
    name: "Fleet",
    price: "$299",
    cadence: "per month",
    annual: "$2,870.40/year with annual billing",
    blurb: "For service providers managing commercial fleets, larger teams, and recurring fleet work.",
    features: [
      "Everything in Pro",
      "Fleet OS",
      "Fleet accounts and vehicle operations",
      "Commercial scheduling and service workflows",
      "5 technicians included",
      "$7.99/month per additional technician",
      "$76.70/year per additional technician on annual billing",
    ],
    cta: "Choose Fleet",
    featured: false,
  },
];

export default function Pricing() {
  return (
    <MarketingLayout>
      <PageHeader
        eyebrow="Pricing"
        title="Simple pricing that grows with your operation."
        subtitle="Start free. Add technicians when your team grows. Move to Fleet when commercial operations become part of the business. Payments stays separate, so your software plan and your merchant account never get confused."
      />

      <div className="grid md:grid-cols-3 gap-6 mb-10">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className="bg-white border-[4px] border-black p-8 flex flex-col"
            style={plan.featured ? hardShadowLg : hardShadow}
          >
            {plan.featured && (
              <div
                className="inline-block self-start border-[3px] border-black px-3 py-1 mb-4 text-xs uppercase tracking-widest font-bold"
                style={{ backgroundColor: PRIMARY_CONTAINER }}
              >
                Most popular
              </div>
            )}
            <div className="text-xs uppercase tracking-widest mb-2" style={{ ...monoStack, color: PRIMARY }}>
              {plan.name}
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-5xl font-black" style={hankenStack}>{plan.price}</span>
            </div>
            <div className="text-sm" style={{ color: "#5e5e5e" }}>{plan.cadence}</div>
            <div className="text-xs mt-1 mb-5 font-semibold" style={{ color: PRIMARY }}>{plan.annual}</div>
            <p className="mb-6" style={{ color: "#3a3a3a" }}>{plan.blurb}</p>
            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={3} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/signup"
              className={neoBtn}
              style={{
                backgroundColor: plan.featured ? PRIMARY_CONTAINER : "#fff",
                ...hardShadow,
                justifyContent: "center",
              }}
            >
              {plan.cta} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ))}
      </div>

      <div className="bg-white border-[4px] border-black p-8 md:p-10 mb-10" style={hardShadowLg}>
        <div className="grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <CreditCard className="w-7 h-7" />
              <span className="text-xs uppercase tracking-widest font-bold" style={{ ...monoStack, color: PRIMARY }}>Payments add-on</span>
            </div>
            <h2 className="text-3xl font-black mb-3" style={hankenStack}>Payments — $99/month</h2>
            <p className="max-w-3xl mb-4" style={{ color: "#3a3a3a" }}>
              Connect your own Stripe account for payment collection, reconciliation, refunds, and payment workflows. Service Writer takes 0% of ordinary shop-owned transactions.
            </p>
            <div className="font-semibold">$950.40/year with annual billing · 20% annual discount</div>
          </div>
          <div className="border-[3px] border-black px-5 py-4 text-center" style={{ backgroundColor: PRIMARY_CONTAINER }}>
            <div className="text-3xl font-black">0%</div>
            <div className="text-xs uppercase tracking-wider font-bold">Service Writer transaction fee</div>
          </div>
        </div>
      </div>

      <NeoCard className="mb-10">
        <div className="grid md:grid-cols-3 gap-8">
          <div>
            <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ ...monoStack, color: PRIMARY }}>Annual billing</div>
            <h3 className="text-xl font-black mb-2" style={hankenStack}>20% off</h3>
            <p style={{ color: "#3a3a3a" }}>Annual prices are calculated from the same locked monthly rates. No separate annual plan logic.</p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ ...monoStack, color: PRIMARY }}>Payments</div>
            <h3 className="text-xl font-black mb-2" style={hankenStack}>Merchant-owned Stripe</h3>
            <p style={{ color: "#3a3a3a" }}>Your normal customer payments belong to your business and settle through your connected Stripe account.</p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest font-bold mb-2" style={{ ...monoStack, color: PRIMARY }}>No surprise commission</div>
            <h3 className="text-xl font-black mb-2" style={hankenStack}>Software pricing stays software pricing</h3>
            <p style={{ color: "#3a3a3a" }}>The Payments add-on is a flat software fee. Service Writer does not take a percentage of ordinary shop transactions.</p>
          </div>
        </div>
      </NeoCard>

      <NeoCard className="text-center">
        <h2 className="text-2xl font-black mb-3" style={hankenStack}>Pick the operating level you need now.</h2>
        <p className="mb-6" style={{ color: "#3a3a3a" }}>
          Basic gets the business running. Pro adds technicians and dispatch. Fleet adds the fleet operating system. Payments can be added separately when you want Stripe inside Service Writer.
        </p>
        <Link to="/signup" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>
          Start with Service Writer <ArrowRight className="w-4 h-4" />
        </Link>
      </NeoCard>
    </MarketingLayout>
  );
}
