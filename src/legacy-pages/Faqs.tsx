import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import {
  MarketingLayout,
  PageHeader,
  NeoCard,
  hankenStack,
  hardShadow,
  PRIMARY_CONTAINER,
} from "@/components/marketing/MarketingLayout";

const FAQS = [
  {
    q: "Who is Service Writer for?",
    a: "Independent auto repair shops, mobile mechanics, and commercial fleet service teams in the United States. If you serve customers in the field or run a small-to-mid-size shop, this is built for you. (Spiffy is for dealerships — we're for everyone else.)",
  },
  {
    q: "How is this different from Shop Monkey or Tekmetric?",
    a: "Those tools were built for brick-and-mortar shops with desktop computers at a service counter. Service Writer is mobile-first and offline-first, designed for technicians working out of vans and shops that operate from a phone.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. The technician app is a local-first PWA backed by WatermelonDB. Jobs, DVIs, photos, and notes capture without signal and sync the moment you're back online.",
  },
  {
    q: "How does payment processing work?",
    a: "Connect Stripe or Square once and customers can pay by card, Apple Pay, or Google Pay where supported. Funds settle directly to your connected payment account.",
  },

  {
    q: "Can my customers book online?",
    a: "Yes. Every account gets a public booking page with real-time availability, geo-aware service area, and weather-aware scheduling.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Start a free account, onboard your first technician, and run real jobs before you pay anything.",
  },
  {
    q: "Where is my data stored?",
    a: "Encrypted in PostgreSQL with row-level security per tenant. We never share data across accounts. Full export available at any time.",
  },
];

const FAQ_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function Faqs() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <MarketingLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }} />
      <PageHeader
        eyebrow="FAQs"
        title="Answers, before you ask."
        subtitle="Everything operators usually want to know before switching from their current stack."
      />
      <div className="max-w-3xl mx-auto space-y-4">
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div
              key={item.q}
              className="bg-white border-[4px] border-black"
              style={hardShadow}
            >
              <button
                className="w-full flex items-center justify-between gap-4 p-5 text-left"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span className="text-lg font-black" style={hankenStack}>
                  {item.q}
                </span>
                <div
                  className="w-8 h-8 border-[3px] border-black flex items-center justify-center shrink-0"
                  style={{ backgroundColor: PRIMARY_CONTAINER }}
                >
                  {isOpen ? <Minus className="w-4 h-4" strokeWidth={3} /> : <Plus className="w-4 h-4" strokeWidth={3} />}
                </div>
              </button>
              {isOpen && (
                <div className="border-t-[3px] border-black p-5 leading-relaxed" style={{ color: "#3a3a3a" }}>
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-16 text-center">
        <NeoCard className="inline-block">
          <p className="text-lg mb-2" style={{ color: "#3a3a3a" }}>Still have a question?</p>
          <a href="mailto:hello@servicewriter.xyz" className="text-xl font-black" style={hankenStack}>
            hello@servicewriter.xyz
          </a>
        </NeoCard>
      </div>
    </MarketingLayout>
  );
}
