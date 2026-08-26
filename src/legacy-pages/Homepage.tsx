import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CarFront,
  Check,
  ClipboardList,
  CreditCard,
  FileText,
  Mail,
  MapPin,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";

import {
  MarketingLayout,
  NeoCard,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_DIM,
  hardShadow,
  hardShadowLg,
  hankenStack,
  monoStack,
  neoBtn,
} from "@/components/marketing/MarketingLayout";
import { productShots } from "@/content/productShots";

function useHomepageMeta() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Service Writer | The operating workspace for mobile service teams";

    const upsert = (selector: string, attribute: string, name: string, content: string) => {
      let tag = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attribute, name);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };

    const description =
      "Service Writer brings booking, customers, vehicles, quotes, invoices, payments, dispatch, and service records into one workspace for mobile service teams.";
    upsert('meta[name="description"]', "name", "description", description);
    upsert('meta[property="og:title"]', "property", "og:title", "Service Writer | One workspace for mobile service operations");
    upsert('meta[property="og:description"]', "property", "og:description", description);
    upsert('meta[name="twitter:title"]', "name", "twitter:title", "Service Writer | One workspace for mobile service operations");
    upsert('meta[name="twitter:description"]', "name", "twitter:description", description);

    const softwareSchema = document.createElement("script");
    softwareSchema.type = "application/ld+json";
    softwareSchema.setAttribute("data-homepage-jsonld", "software");
    softwareSchema.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Service Writer",
      applicationCategory: "BusinessApplication",
      description,
      url: window.location.origin,
    });
    document.head.appendChild(softwareSchema);

    return () => {
      document.title = previousTitle;
      softwareSchema.remove();
    };
  }, []);
}

type Capability = {
  label: string;
  title: string;
  copy: string;
  icon: typeof CalendarDays;
  shot?: string;
};

const CAPABILITIES: Capability[] = [
  {
    label: "01 / Book",
    title: "Give customers a clear way to request service",
    copy: "Publish services, availability, service areas, intake questions, and public booking without sending customers through a maze of messages.",
    icon: CalendarDays,
    shot: productShots.servicePackages,
  },
  {
    label: "02 / Understand",
    title: "Keep customer and vehicle context with the job",
    copy: "Profiles, vehicles, VIN details, notes, and service records stay connected so the team can start with the right context.",
    icon: CarFront,
    shot: productShots.vehicleSpecs,
  },
  {
    label: "03 / Quote",
    title: "Move from estimate to approved work",
    copy: "Create quotes, track approval or decline, and convert approved work into an appointment or service record.",
    icon: FileText,
    shot: productShots.payments,
  },
  {
    label: "04 / Operate",
    title: "Coordinate appointments and field work",
    copy: "Assign work, update status, manage checklists, and keep office and technician workflows connected.",
    icon: ClipboardList,
  },
  {
    label: "05 / Collect",
    title: "Keep invoices and payments in the same flow",
    copy: "Create invoices, record payment status, support payment actions, and keep a durable history of customer-facing transactions.",
    icon: CreditCard,
    shot: productShots.financials,
  },
  {
    label: "06 / Follow through",
    title: "Send important updates without rebuilding the system each time",
    copy: "Transactional email events use a shared, retryable delivery path with templates, idempotency, and delivery tracking.",
    icon: Mail,
  },
];

const WORKFLOW_STEPS = [
  { number: "01", title: "Set up the workspace", copy: "Configure your business, services, availability, team access, and customer-facing booking details." },
  { number: "02", title: "Capture the request", copy: "A customer, advisor, or team member creates the booking, customer, vehicle, quote, or work order." },
  { number: "03", title: "Do the work", copy: "The team works from shared appointment, dispatch, vehicle, and service-record context." },
  { number: "04", title: "Close the loop", copy: "Issue the invoice, record payment, send the right transaction update, and keep the history for the next visit." },
];

const OPERATIONAL_SURFACES = [
  "Appointments and public booking",
  "Customers and vehicle records",
  "Quotes and quote conversion",
  "Invoices and payment actions",
  "Dispatch and technician workflows",
  "Service records and checklists",
  "Fleet and work-order operations",
  "Transactional email delivery",
];

function CapabilityCard({ capability }: { capability: Capability }) {
  const Icon = capability.icon;
  return (
    <article className="bg-white border-[4px] border-black p-5 md:p-6" style={hardShadow}>
      <div className="aspect-[16/9] border-[3px] border-black mb-5 flex items-center justify-center overflow-hidden" style={{ backgroundColor: PRIMARY_CONTAINER }}>
        {capability.shot ? (
          <img src={capability.shot} alt={`${capability.title} in Service Writer`} loading="lazy" className="w-full h-full object-cover object-top" />
        ) : (
          <Icon className="w-14 h-14" strokeWidth={2} />
        )}
      </div>
      <span className="uppercase text-[10px] tracking-widest" style={{ ...monoStack, color: PRIMARY }}>{capability.label}</span>
      <h3 className="text-xl md:text-2xl font-black mt-2 mb-3" style={hankenStack}>{capability.title}</h3>
      <p className="text-sm md:text-base" style={{ color: "#5e5e5e", lineHeight: 1.55 }}>{capability.copy}</p>
    </article>
  );
}

export default function Homepage() {
  useHomepageMeta();

  return (
    <MarketingLayout>
      <header className="grid lg:grid-cols-[1.05fr_.95fr] gap-10 lg:gap-14 items-center mb-24 md:mb-32">
        <div>
          <div className="inline-flex items-center gap-2 border-[3px] border-black bg-white px-4 py-2 mb-6" style={hardShadow}>
            <Wrench className="w-4 h-4" strokeWidth={3} />
            <span className="uppercase text-[10px] tracking-widest" style={{ ...monoStack, color: PRIMARY }}>Built for mobile service operations</span>
          </div>
          <h1 className="font-black mb-6" style={{ ...hankenStack, fontSize: "clamp(42px, 7vw, 78px)", lineHeight: 1.02, letterSpacing: "-0.05em" }}>
            Run the work from request to a working day.
          </h1>
          <p className="text-lg md:text-xl max-w-xl mb-8" style={{ color: "#5e5e5e", lineHeight: 1.55 }}>
            Service Writer is a practical workspace for teams that book, dispatch, service, and collect in the field. Keep the customer, vehicle, work, and payment record together.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link to="/signup" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>
              Start with the workspace <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/features-guide" className={neoBtn} style={{ backgroundColor: "#fff", ...hardShadow }}>
              See what is inside
            </Link>
          </div>
          <p className="mt-5 text-xs uppercase tracking-wide" style={{ ...monoStack, color: "#5e5e5e" }}>
            No inflated promises. Just the workflow your team can use today.
          </p>
        </div>
        <div className="border-[4px] border-black bg-white p-2 md:p-3" style={hardShadowLg}>
          <div className="border-[3px] border-black p-5 md:p-7" style={{ backgroundColor: PRIMARY_CONTAINER }}>
            <div className="flex justify-between items-start mb-8">
              <div>
                <span className="uppercase text-[10px] tracking-widest" style={monoStack}>Service Writer / workspace</span>
                <h2 className="text-3xl md:text-4xl font-black mt-2" style={hankenStack}>One operating view.</h2>
              </div>
              <ShieldCheck className="w-8 h-8" strokeWidth={2.5} />
            </div>
            <div className="space-y-3">
              {[
                ["Today", "Appointments, dispatch, service records"],
                ["Customers", "Profiles, vehicles, notes, history"],
                ["Money", "Quotes, invoices, payments"],
                ["Updates", "Durable transactional email delivery"],
              ].map(([label, value]) => (
                <div key={label} className="border-[3px] border-black bg-white px-4 py-3 flex items-center justify-between gap-4">
                  <span className="font-black" style={hankenStack}>{label}</span>
                  <span className="text-right text-xs" style={{ color: "#5e5e5e" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="mb-24 md:mb-32" id="how-it-works">
        <div className="flex items-center gap-4 md:gap-6 mb-10">
          <h2 className="uppercase tracking-widest text-white px-4 md:px-6 py-2 text-lg md:text-2xl font-black" style={{ ...hankenStack, backgroundColor: "#000" }}>
            The workflow
          </h2>
          <div className="h-[4px] flex-grow bg-black" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {WORKFLOW_STEPS.map((step) => (
            <article key={step.number} className="border-[4px] border-black bg-white p-5" style={hardShadow}>
              <span className="text-3xl font-black" style={{ ...monoStack, color: PRIMARY }}>{step.number}</span>
              <h3 className="text-xl font-black mt-6 mb-3" style={hankenStack}>{step.title}</h3>
              <p className="text-sm" style={{ color: "#5e5e5e", lineHeight: 1.55 }}>{step.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mb-24 md:mb-32">
        <div className="max-w-3xl mb-10">
          <span className="uppercase text-xs tracking-widest" style={{ ...monoStack, color: PRIMARY }}>What is actually here</span>
          <h2 className="text-4xl md:text-6xl font-black mt-3" style={{ ...hankenStack, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
            The parts of the operation that need to stay connected.
          </h2>
          <p className="text-lg mt-5" style={{ color: "#5e5e5e", lineHeight: 1.6 }}>
            The product is organized around the records and handoffs that make mobile service work: who needs service, what vehicle is involved, what was promised, who is doing the work, and what still needs to be collected.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {CAPABILITIES.map((capability) => <CapabilityCard key={capability.title} capability={capability} />)}
        </div>
      </section>

      <section className="mb-24 md:mb-32 grid lg:grid-cols-[.9fr_1.1fr] gap-8 items-start">
        <NeoCard>
          <span className="uppercase text-xs tracking-widest" style={{ ...monoStack, color: PRIMARY }}>For the whole team</span>
          <h2 className="text-3xl md:text-5xl font-black mt-3 mb-5" style={{ ...hankenStack, lineHeight: 1.05 }}>
            One record, different responsibilities.
          </h2>
          <p className="mb-6" style={{ color: "#5e5e5e", lineHeight: 1.6 }}>
            Owners and managers can configure the workspace. Advisors can organize customers, quotes, appointments, and invoices. Technicians can work from the field workflow. Customers receive the updates that matter to their service.
          </p>
          <Link to="/features-guide" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>
            Explore the product <ArrowRight className="w-4 h-4" />
          </Link>
        </NeoCard>
        <div className="border-[4px] border-black bg-white p-6 md:p-8" style={{ boxShadow: "6px 6px 0px #000" }}>
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-7 h-7" strokeWidth={2.5} />
            <h3 className="text-2xl font-black" style={hankenStack}>Operational surfaces</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {OPERATIONAL_SURFACES.map((surface) => (
              <div key={surface} className="flex items-start gap-2 border-b-2 border-black/10 pb-3">
                <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: PRIMARY }} strokeWidth={3} />
                <span className="text-sm">{surface}</span>
              </div>
            ))}
          </div>
          <div className="mt-7 flex items-start gap-3 border-[3px] border-black p-4" style={{ backgroundColor: SURFACE_DIM }}>
            <MapPin className="w-5 h-5 shrink-0" strokeWidth={2.5} />
            <p className="text-sm" style={{ lineHeight: 1.5 }}>
              Built around mobile service work, with workspace-level settings, roles, service areas, and timezone-aware operating details.
            </p>
          </div>
        </div>
      </section>

      <section className="border-[4px] border-black p-7 md:p-12 text-center mb-8" style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadowLg }}>
        <h2 className="text-4xl md:text-6xl font-black mb-5" style={{ ...hankenStack, lineHeight: 1.02, letterSpacing: "-0.04em" }}>
          Make the handoffs visible.
        </h2>
        <p className="max-w-2xl mx-auto mb-8 text-lg" style={{ lineHeight: 1.55 }}>
          See how Service Writer fits your operation, then start with the workflows that matter most.
        </p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <Link to="/signup" className={neoBtn} style={{ backgroundColor: "#fff", ...hardShadow }}>
            Create an account <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/contact" className={neoBtn} style={{ backgroundColor: "transparent" }}>
            Talk through your setup
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
