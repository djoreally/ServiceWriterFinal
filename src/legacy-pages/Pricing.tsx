import { Link } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
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
    name: "Pay As You Grow",
    price: "$0",
    cadence: "per month + 3% platform fee",
    blurb: "For brand-new operators who want lower signup friction.",
    features: [
      "No monthly subscription",
      "3% Service Writer fee on processed payments",
      "Public booking and payment links",
      "Customer and vehicle records",
      "Upgrade around 40 monthly jobs",
    ],
    cta: "Create account",
    featured: false,
  },
  {
    name: "Starter",
    price: "$149",
    cadence: "per month",
    blurb: "For solo mobile mechanics and shops ready for the paid platform.",
    features: [
      "1 user",
      "Public booking page",
      "Two-way SMS (pay-as-you-go)",
      "Stripe or Square payments",
      "Mobile DVIs & photos",
    ],
    cta: "Create account",
    featured: false,
  },
  {
    name: "Shop",
    price: "$299",
    cadence: "per month",
    blurb: "For independent shops & growing mobile teams.",
    features: [
      "Up to 5 users",
      "Dispatch board + routing",
      "Two-way SMS included",
      "Offline technician app",
      "Quotes, invoices, payments",
      "Retention engine",
    ],
    cta: "Create account",
    featured: true,
  },
  {
    name: "Fleet",
    price: "Custom",
    cadence: "talk to sales",
    blurb: "For commercial fleet service & multi-location ops.",
    features: [
      "Unlimited users",
      "Fleet ERP & contracts",
      "Bulk vehicle import",
      "AI receptionist",
      "Priority support",
      "SSO & custom roles",
    ],
    cta: "Book a demo",
    featured: false,
  },
];

export default function Pricing() {
  return (
    <MarketingLayout>
      <PageHeader
        eyebrow="Pricing"
        title="Paid plans for serious service teams."
        subtitle="Start with Pay As You Grow or choose a subscription plan. Compare the included workflow support, team capacity, and payment model before selecting a plan."
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className="bg-white border-[4px] border-black p-8 flex flex-col"
            style={p.featured ? hardShadowLg : hardShadow}
          >
            {p.featured && (
              <div
                className="inline-block self-start border-[3px] border-black px-3 py-1 mb-4 text-xs uppercase tracking-widest font-bold"
                style={{ backgroundColor: PRIMARY_CONTAINER }}
              >
                Most popular
              </div>
            )}
            <div className="text-xs uppercase tracking-widest mb-2" style={{ ...monoStack, color: PRIMARY }}>
              {p.name}
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-5xl font-black" style={hankenStack}>{p.price}</span>
            </div>
            <div className="text-sm mb-4" style={{ color: "#5e5e5e" }}>{p.cadence}</div>
            <p className="mb-6" style={{ color: "#3a3a3a" }}>{p.blurb}</p>
            <ul className="space-y-3 mb-8 flex-1">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="w-5 h-5 mt-0.5 shrink-0" strokeWidth={3} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              to={p.name === "Fleet" ? "/contact" : "/signup"}
              className={neoBtn}
              style={{
                backgroundColor: p.featured ? PRIMARY_CONTAINER : "#fff",
                ...hardShadow,
                justifyContent: "center",
              }}
            >
              {p.cta} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ))}
      </div>

      <NeoCard className="text-center">
        <h2 className="text-2xl font-black mb-3" style={hankenStack}>
          Questions about the right plan?
        </h2>
        <p className="mb-6" style={{ color: "#3a3a3a" }}>
          We'll walk through your workflow and recommend the cheapest plan that fits.
        </p>
        <Link to="/contact" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>
          Book a demo
        </Link>
      </NeoCard>
    </MarketingLayout>
  );
}
