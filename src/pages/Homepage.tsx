import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  RefreshCw,
  ListOrdered,
  Truck,
  Receipt,
  Users,
  MessageSquare,
  Smartphone,
  BarChart3,
  Settings,
  MapPin,
  Sparkles,
} from "lucide-react";

import {
  MarketingLayout,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_DIM,
  neoBtn,
  hardShadow,
  hardShadowLg,
  hankenStack,
  monoStack,
} from "@/components/marketing/MarketingLayout";
import { productShots } from "@/content/productShots";


/**
 * Marketing homepage — written for mobile service business owners.
 * No technical jargon. Plain language only.
 */
function useHomepageMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Service Writer — Software built for mobile service businesses";

    const upsert = (selector: string, attr: string, name: string, content: string) => {
      let tag = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
      return tag;
    };

    const desc =
      "Run your mobile service business from one place — online booking, dispatch, payments, customer history, and automated follow-ups.";

    upsert('meta[name="description"]', "name", "description", desc);
    upsert('meta[property="og:title"]', "property", "og:title", "Service Writer — Software for mobile service businesses");
    upsert('meta[property="og:description"]', "property", "og:description", desc);
    upsert('meta[name="twitter:title"]', "name", "twitter:title", "Service Writer — Software for mobile service businesses");
    upsert('meta[name="twitter:description"]', "name", "twitter:description", desc);

    const faqSchema = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Service Writer?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Service Writer is software built for mobile service businesses. It combines online booking, dispatch, payments, customer and vehicle history, automated follow-ups, and a technician app in one place.",
          },
        },
        {
          "@type": "Question",
          name: "Who is Service Writer for?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Mobile mechanics, mobile auto shops, and fleet service teams who go to the customer instead of waiting for the customer to come to them.",
          },
        },
        {
          "@type": "Question",
          name: "Do I need a separate payment processor?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You connect your own Stripe or Square account. Subscription plans keep platform fees lower, while Pay As You Grow carries a 3% Service Writer platform fee on processed payments.",
          },
        },
        {
          "@type": "Question",
          name: "Does Service Writer work in the field without internet?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Technicians can complete jobs, take notes, and capture photos without a connection. Everything syncs automatically when service returns.",
          },
        },
        {
          "@type": "Question",
          name: "How much does Service Writer cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You can start a free account with no credit card. See the pricing page for current plan details.",
          },
        },
      ],
    };

    const softwareSchema = {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Service Writer",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, Android",
      description: desc,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: window.location.origin,
    };

    const scripts: HTMLScriptElement[] = [];
    [faqSchema, softwareSchema].forEach((schema, i) => {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.setAttribute("data-homepage-jsonld", String(i));
      s.text = JSON.stringify(schema);
      document.head.appendChild(s);
      scripts.push(s);
    });

    return () => {
      document.title = prevTitle;
      scripts.forEach((s) => s.remove());
    };
  }, []);
}

type Feature = {
  eyebrow: string;
  name: string;
  blurb: string;
  icon: typeof Calendar;
  shot?: string;
};

const PRIMARY_FEATURES: Feature[] = [
  { eyebrow: "01 · Booking", name: "Book more jobs, without opening the calendar", blurb: "Branded booking, availability rules, service areas, and intake in one customer flow.", icon: Calendar, shot: productShots.servicePackages },
  { eyebrow: "02 · Service context", name: "Know the customer, vehicle, and job before you arrive", blurb: "Customer profiles, vehicle history, service records, notes, and VIN context travel with every job.", icon: Users, shot: productShots.vehicleSpecs },
  { eyebrow: "03 · Payments", name: "Quote, invoice, and collect in one operating flow", blurb: "Move from a quote to invoices, booking payments, payment links, refunds, and payment visibility.", icon: Receipt, shot: productShots.payments },
  { eyebrow: "04 · Operations", name: "Dispatch work with the office and field team on the same page", blurb: "Assignments, job status, technician handoff, and mobile job updates stay connected.", icon: ListOrdered, shot: productShots.inventoryItems },
  { eyebrow: "05 · Repeatable work", name: "Standardize repeatable work", blurb: "Build a service catalog, packages, recurring services, and reusable operational settings.", icon: RefreshCw, shot: productShots.subscriptions },
  { eyebrow: "06 · Fleet", name: "Run retail and fleet work from the same platform", blurb: "Manage fleet clients, work orders, contracts, purchase orders, scheduling, and invoicing.", icon: Truck, shot: productShots.financials },
];

const FEATURE_GROUPS: { title: string; features: Feature[] }[] = [
  {
    title: "Win and schedule work",
    features: [
      { eyebrow: "Booking", name: "Online booking and availability", blurb: "Publish a booking flow and control hours, lead times, buffers, blackout dates, service areas, and intake questions.", icon: Calendar, shot: productShots.servicePackages },
      { eyebrow: "Appointments", name: "Appointments and service execution", blurb: "Create, assign, reschedule, update, complete, and review appointments in one operational record.", icon: ListOrdered },
      { eyebrow: "Payments", name: "Quotes, invoices, and payment collection", blurb: "Build quotes, issue invoices, collect payments, send payment links, and record refunds and payment status.", icon: Receipt, shot: productShots.payments },
      { eyebrow: "Messaging", name: "Customer messaging and follow-up", blurb: "Keep service communications and customer preferences connected to the work.", icon: MessageSquare },
    ],
  },
  {
    title: "Deliver the service",
    features: [
      { eyebrow: "History", name: "Customer and vehicle history", blurb: "Keep profiles, vehicles, service records, notes, images, and VIN data connected across visits.", icon: Users, shot: productShots.vehicleSpecs },
      { eyebrow: "Dispatch", name: "Dispatch and technician operations", blurb: "Assign technicians and vans, track job states, and keep the office and field team aligned.", icon: ListOrdered },
      { eyebrow: "Technician OS", name: "Technician OS", blurb: "Give technicians today’s work, mobile job updates, inventory, dispatch messaging, and vehicle-data tools.", icon: Smartphone, shot: productShots.inventoryOilUsage },
      { eyebrow: "Services", name: "Service catalog, packages, and recurring work", blurb: "Maintain services, assemble packages, and schedule recurring work for repeat customers.", icon: RefreshCw, shot: productShots.subscriptions },
      { eyebrow: "Vehicle data", name: "Vehicle intelligence", blurb: "Decode VINs, search specifications, inspect maintenance information, and look up filter cross-references.", icon: MapPin, shot: productShots.vehicleSpecs },
    ],
  },
  {
    title: "Run the business",
    features: [
      { eyebrow: "Reporting", name: "Operational and financial reporting", blurb: "Review appointment, payment, service, and business reporting, then export the data you need for follow-up.", icon: BarChart3, shot: productShots.financials },
      { eyebrow: "Fleet", name: "Fleet operations", blurb: "Maintain fleet clients, contacts, vehicles, locations, contracts, work orders, schedules, purchase orders, check-ins, and invoices.", icon: Truck, shot: productShots.inventoryItems },
      { eyebrow: "Setup", name: "Business setup and access control", blurb: "Manage services, availability, business settings, team access, subscription settings, and booking configuration.", icon: Settings, shot: productShots.inventoryEmpty },
    ],
  },
];

function FeatureTile({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <article
      className="block bg-white border-[4px] border-black p-6 transition-transform hover:-translate-y-1"
      style={hardShadow}
    >
      <div
        className="w-full aspect-[16/9] border-[3px] border-black mb-5 overflow-hidden flex items-center justify-center"
        style={{ backgroundColor: PRIMARY_CONTAINER }}
      >
        {feature.shot ? (
          <img
            src={feature.shot}
            alt={`${feature.name} — Service Writer screen`}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <Icon className="w-14 h-14" strokeWidth={2} />
        )}
      </div>
      <span className="uppercase text-[10px] tracking-widest" style={{ ...monoStack, color: PRIMARY }}>{feature.eyebrow}</span>
      <h3 className="text-xl font-black mb-2" style={hankenStack}>{feature.name}</h3>
      <p className="text-sm mb-4" style={{ color: "#5e5e5e", lineHeight: 1.5 }}>{feature.blurb}</p>
    </article>
  );
}


const Homepage = () => {
  useHomepageMeta();

  return (
    <MarketingLayout>
      {/* Hero */}
      <header className="mb-20 md:mb-28 text-center">
          <div className="inline-block border-[3px] border-black bg-white px-4 py-1.5 mb-6" style={hardShadow}>
            <span className="uppercase text-[10px] md:text-xs tracking-widest" style={{ ...monoStack, color: PRIMARY }}>
              Built for mobile service businesses
            </span>
          </div>
          <h1
            className="mb-6 md:mb-8 max-w-4xl mx-auto font-black"
            style={{
              ...hankenStack,
              fontSize: "clamp(36px, 8vw, 72px)",
              lineHeight: 1.05,
              letterSpacing: "-0.04em",
            }}
          >
            Everything you need to run your operation —{" "}
            <span className="px-3 inline-block" style={{ backgroundColor: PRIMARY_CONTAINER }}>
              and nothing you don't.
            </span>
          </h1>
          <p className="text-lg md:text-xl max-w-2xl mx-auto mb-8 md:mb-10" style={{ color: "#5e5e5e", lineHeight: 1.55 }}>
            Service Writer is built around how mobile service actually works. Booking, dispatch, payments,
            customer history, and follow-ups — all in one place.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 max-w-xl mx-auto">
            <Link
              to="/signup"
              className={neoBtn}
              style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow, fontSize: "1rem", paddingLeft: "2rem", paddingRight: "2rem" }}
            >
              Start free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/contact"
              className={neoBtn}
              style={{ backgroundColor: "#fff", ...hardShadow, fontSize: "1rem", paddingLeft: "2rem", paddingRight: "2rem" }}
            >
              Book demo
            </Link>
          </div>

          <div className="mt-12 md:mt-16 border-[4px] border-black bg-white p-2 md:p-3" style={hardShadowLg}>
            <img
              src={productShots.financials}
              alt="Service Writer financial overview dashboard"
              className="w-full border-[3px] border-black object-cover object-top"
            />
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { src: productShots.inventoryItems, alt: "Parts and inventory table in Service Writer" },
              { src: productShots.payments, alt: "Payments and transaction history in Service Writer" },
              { src: productShots.vehicleSpecs, alt: "Vehicle data center in Service Writer" },
            ].map((shot) => (
              <div key={shot.src} className="border-[4px] border-black bg-white p-1.5" style={hardShadow}>
                <img src={shot.src} alt={shot.alt} loading="lazy" className="w-full aspect-[16/10] object-cover object-top border-[2px] border-black" />
              </div>
            ))}
          </div>
        </header>


      {/* How It Works / Feature grid */}
      <section id="how-it-works" className="mb-24 md:mb-32">
          <div className="flex items-center gap-4 md:gap-6 mb-8 md:mb-12">
            <h2
              className="uppercase tracking-widest text-white px-4 md:px-6 py-2 text-lg md:text-2xl font-black"
              style={{ ...hankenStack, backgroundColor: "#000" }}
            >
              How It Works
            </h2>
            <div className="h-[4px] flex-grow bg-black" />
          </div>

          <div className="mb-10 max-w-3xl">
            <h3 className="text-2xl md:text-4xl font-black mb-4" style={hankenStack}>
              Here's what's inside.
            </h3>
            <p className="text-base md:text-lg" style={{ color: "#5e5e5e", lineHeight: 1.6 }}>
              Start with the operating workflow that customers experience, then explore every
              tool that helps your team deliver it.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {PRIMARY_FEATURES.map((feature) => (
              <FeatureTile key={feature.name} feature={feature} />
            ))}
          </div>
        </section>

      {/* Full feature list */}
      <section className="mb-24 md:mb-32">
        <div className="flex items-center gap-4 md:gap-6 mb-8 md:mb-12">
          <h2
            className="uppercase tracking-widest text-white px-4 md:px-6 py-2 text-lg md:text-2xl font-black"
            style={{ ...hankenStack, backgroundColor: "#000" }}
          >
            The complete toolkit
          </h2>
          <div className="h-[4px] flex-grow bg-black" />
        </div>
        <div className="space-y-16 md:space-y-20">
          {FEATURE_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-2xl md:text-3xl font-black mb-6" style={hankenStack}>{group.title}</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                {group.features.map((feature) => (
                  <FeatureTile key={feature.name} feature={feature} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      {/* A concise, evidence-safe reporting callout */}
      <section className="mb-24 md:mb-32">
            <div className="flex items-center gap-4 md:gap-6 mb-8 md:mb-12">
              <h2
                className="uppercase tracking-widest text-white px-4 md:px-6 py-2 text-lg md:text-2xl font-black"
                style={{ ...hankenStack, backgroundColor: "#000" }}
              >
                Built for the whole operation
              </h2>
              <div className="h-[4px] flex-grow bg-black" />
            </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border-[4px] border-black p-6 md:p-8" style={hardShadow}>
              <BarChart3 className="w-10 h-10 mb-4" strokeWidth={2} />
              <h3 className="text-2xl font-black mb-3" style={hankenStack}>Operational reporting</h3>
              <p style={{ color: "#3a3a3a", lineHeight: 1.6 }}>
                Review appointment, payment, service, and business data together, then export what
                your team needs for follow-up.
              </p>
            </div>
            <div className="bg-white border-[4px] border-black p-6 md:p-8" style={hardShadow}>
              <Settings className="w-10 h-10 mb-4" strokeWidth={2} />
              <h3 className="text-2xl font-black mb-3" style={hankenStack}>Configured for your business</h3>
              <p style={{ color: "#3a3a3a", lineHeight: 1.6 }}>
                Configure services, availability, team access, subscription settings, and the booking
                experience around the way your operation works.
              </p>
            </div>
          </div>
        </section>

      {/* Final CTA */}
      <section
        className="border-[4px] border-black p-8 md:p-14 text-center"
          style={{ backgroundColor: "#000", color: "#fff", ...hardShadowLg }}
        >
          <Sparkles className="w-10 h-10 mx-auto mb-5" style={{ color: PRIMARY_CONTAINER }} strokeWidth={2} />
          <h2 className="text-3xl md:text-5xl font-black mb-5" style={hankenStack}>
            See it in action.
          </h2>
          <p className="text-base md:text-lg mb-8 max-w-xl mx-auto" style={{ color: SURFACE_DIM }}>
            The fastest way to understand what Service Writer can do is to run a test booking.
          </p>
          <Link
            to="/signup"
            className={neoBtn}
            style={{
              backgroundColor: PRIMARY_CONTAINER,
              color: "#000",
              borderColor: "#fff",
              boxShadow: "4px 4px 0px #e5ff00",
              fontSize: "1rem",
            }}
          >
            Start free <ArrowRight className="w-5 h-5" />
          </Link>
      </section>
    </MarketingLayout>
  );
};

export default Homepage;
