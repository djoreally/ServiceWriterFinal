import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { ArrowRight, Check, Megaphone, Network, ShieldCheck, TrendingUp } from "lucide-react";
import {
  MarketingLayout,
  PRIMARY,
  PRIMARY_CONTAINER,
  hardShadow,
  hardShadowLg,
  hankenStack,
  monoStack,
  neoBtn,
} from "@/components/marketing/MarketingLayout";

const advertisingChannels = [
  "Google Search campaigns", "Social media advertising", "Video advertising", "Streaming television",
  "Radio campaigns", "Retargeting", "Email marketing", "Push notifications", "Local sponsorships",
  "Outdoor advertising and billboards",
];

const workflow = [
  ["Join Service Writer", "Subscribe to Service Writer and receive the tools needed to manage customers, vehicles, appointments, dispatch, work orders, payments and service history."],
  ["Build Your Provider Profile", "Choose the services you offer, define your service area, set your availability and complete the verification requirements for your categories."],
  ["Become Discoverable", "Qualified providers can appear in the free Service Writer consumer marketplace when customers search for automotive services in their area."],
  ["Service Writer Advertises the Marketplace", "Service Writer uses collective advertising resources to attract customers searching for automotive services. Campaigns promote the Service Writer marketplace instead of sending customers to only one provider."],
  ["Customers Find the Right Provider", "Customers select their location, vehicle and requested service. Service Writer matches them with qualified providers based on coverage, availability, capability and network performance."],
  ["You Manage the Job", "Bookings flow into Service Writer so you can quote, schedule, dispatch, communicate, perform the service, collect payment and maintain the customer relationship."],
];

const membershipFeatures = [
  "Online booking", "Customer and vehicle management", "Estimates and work orders", "Mobile dispatch",
  "Team and technician management", "Service-area controls", "Availability and scheduling", "Service packages",
  "Maintenance subscriptions", "Digital inspections", "Payments and invoices", "Customer communication",
  "Service history", "Marketplace participation", "Network advertising support", "Lead and booking attribution",
  "Performance reporting",
];

const providerTypes = [
  "Mobile mechanics", "Mobile oil-change providers", "Independent repair shops", "Tire sales and installation providers",
  "Mobile tire services", "Mobile detailers", "Roadside-assistance providers", "Battery-service providers",
  "Brake specialists", "Diesel technicians", "Fleet-maintenance providers", "Vehicle inspection services",
  "Specialty automotive businesses",
];

const enrollmentFactors = [
  "Geographic service area", "Service category", "Customer demand", "Provider capacity", "Appointment availability",
  "Response time", "Completion rate", "Customer experience", "Licensing, insurance or verification requirements",
];

const distributionFactors = [
  "Distance from the customer", "Provider service area", "Requested service", "Vehicle compatibility",
  "Real-time availability", "Provider capacity", "Response time", "Completion history", "Customer ratings",
  "Cancellation history", "Fair distribution across qualified providers",
];

const reporting = [
  "Network advertising activity", "Marketplace impressions", "Provider-profile views", "Customer inquiries",
  "Booking requests", "Confirmed appointments", "Booking conversion rate", "Services requested", "Customer locations",
  "Estimated booking value", "Completed marketplace jobs", "Territory demand", "Missed opportunities", "Provider response time",
];

const faqs = [
  ["Is the marketplace free for customers?", "Yes. Customers can search the Service Writer marketplace and discover participating providers without paying a marketplace access fee."],
  ["Do providers pay for every lead?", "Service Writer’s core model does not require providers to purchase individual leads. Marketplace access and collective advertising support are connected to eligible Service Writer memberships."],
  ["Does Service Writer take a percentage of every job?", "Service Writer does not need to take a marketplace commission from every completed job. Normal payment-processing fees and charges for optional products or services may still apply and will be disclosed separately."],
  ["Does membership guarantee leads or bookings?", "No. Advertising performance and customer demand cannot be guaranteed. Results depend on location, category, availability, pricing, customer demand, competition and provider performance."],
  ["Is my membership payment spent only in my territory?", "No. Collective advertising resources may be pooled across the network. Service Writer may allocate campaigns according to coverage, demand, market readiness, seasonality and overall network strategy."],
  ["Can I choose my service area?", "Yes. Providers can define the areas they serve. Service areas may be reviewed to ensure the provider can respond reliably and to maintain balanced network coverage."],
  ["Can I select multiple service categories?", "Yes, when your business is qualified and equipped to perform those services. Some categories may require additional verification."],
  ["Can every provider join immediately?", "Not necessarily. Enrollment may be limited by territory, category, current demand and network capacity. Providers may be placed on a waiting list when an area already has sufficient coverage."],
  ["Who owns the customer relationship?", "The customer books through Service Writer and receives service from the assigned independent provider. Providers can manage the resulting appointment and ongoing service relationship through their Service Writer account, subject to applicable platform terms and customer preferences."],
  ["Can I still run my own advertising?", "Yes. Providers remain free to advertise their businesses independently. The collective network is designed to supplement—not prohibit—your existing marketing."],
  ["What happens if I cancel my membership?", "Your software access and eligibility for participating membership benefits may end according to your subscription terms. Historical business records will be handled according to the Service Writer terms, data-retention policy and applicable law."],
];

function Checklist({ items }: { items: string[] }) {
  return <ul className="grid gap-3 sm:grid-cols-2">{items.map((item) => <li key={item} className="flex items-start gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 border-black" style={{ backgroundColor: PRIMARY_CONTAINER }}><Check className="h-3 w-3" strokeWidth={4} /></span><span>{item}</span></li>)}</ul>;
}

function Section({ eyebrow, title, children, dark = false }: { eyebrow: string; title: string; children: ReactNode; dark?: boolean }) {
  return <section className={`border-[4px] border-black p-7 sm:p-10 ${dark ? "bg-black text-white" : "bg-white"}`} style={hardShadowLg}>
    <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em]" style={{ ...monoStack, color: dark ? PRIMARY_CONTAINER : PRIMARY }}>{eyebrow}</p>
    <h2 className="mb-6 text-3xl font-black leading-tight sm:text-4xl" style={hankenStack}>{title}</h2>
    <div className={`space-y-5 text-base leading-7 ${dark ? "text-white/80" : "text-black/70"}`}>{children}</div>
  </section>;
}

export default function AdvertisingNetwork() {
  return <MarketingLayout>
    <div className="space-y-16">
      <header className="grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr]">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 border-[3px] border-black bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest" style={hardShadow}><Network className="h-4 w-4" /> The Service Writer Network</div>
          <h1 className="font-black uppercase leading-[.92] tracking-[-0.055em]" style={{ ...hankenStack, fontSize: "clamp(54px, 9vw, 104px)" }}>Stop<br /><span style={{ color: PRIMARY }}>Advertising</span><br />Alone</h1>
          <p className="mt-7 max-w-2xl text-xl font-bold leading-8">Join the collective advertising network built for independent automotive service providers.</p>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-black/65">Service Writer gives independent shops, mobile mechanics, tire professionals, detailers and fleet service providers the power to advertise together.</p>
          <div className="mt-8 flex flex-wrap gap-4"><Link to="/signup" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>Join the Network <ArrowRight className="h-4 w-4" /></Link><a href="#how-it-works" className={neoBtn} style={{ backgroundColor: "white", ...hardShadow }}>See How It Works</a></div>
        </div>
        <div className="relative border-[4px] border-black bg-black p-8 text-white" style={hardShadowLg}>
          <Megaphone className="h-20 w-20" style={{ color: PRIMARY_CONTAINER }} />
          <p className="mt-12 text-3xl font-black leading-tight" style={hankenStack}>One network.<br />One brand.<br /><span style={{ color: PRIMARY_CONTAINER }}>More advertising power.</span></p>
          <p className="mt-6 leading-7 text-white/70">A portion of Service Writer membership revenue supports collective advertising designed to bring customers into one trusted automotive marketplace.</p>
        </div>
      </header>

      <Section eyebrow="Collective reach" title="One Network. One Brand. More Advertising Power."><p>A single independent provider might spend a few hundred dollars each month promoting one business in one area. The Service Writer Network combines the strength of participating providers to build a larger, more competitive advertising presence.</p><p>As the network grows, collective advertising may include:</p><Checklist items={advertisingChannels} /><p className="font-bold text-black">Instead of competing alone, providers contribute to a marketplace capable of advertising automotive services at a meaningful scale.</p></Section>

      <section id="how-it-works"><div className="mb-8"><p className="text-xs font-bold uppercase tracking-[.2em]" style={{ ...monoStack, color: PRIMARY }}>From membership to completed work</p><h2 className="mt-3 text-4xl font-black sm:text-5xl" style={hankenStack}>How It Works</h2></div><div className="grid gap-5 md:grid-cols-2">{workflow.map(([title, text], index) => <article key={title} className="border-[4px] border-black bg-white p-6" style={hardShadow}><span className="text-sm font-black" style={{ ...monoStack, color: PRIMARY }}>0{index + 1}</span><h3 className="mt-3 text-xl font-black" style={hankenStack}>{title}</h3><p className="mt-3 leading-7 text-black/65">{text}</p></article>)}</div></section>

      <Section eyebrow="One connected platform" title="Software and Customer Acquisition Working Together" dark><p>Service Writer is more than a directory that sells leads. It is the operating system providers use to manage the customers generated through the network.</p><p>Your membership can include:</p><Checklist items={membershipFeatures} /><p>The customer can move from discovery to booking without leaving the Service Writer experience.</p></Section>

      <Section eyebrow="No marketplace commission" title="You Keep Your Service Revenue"><p>Traditional marketplaces may charge providers for every lead, take a percentage of every transaction or increase fees as the provider becomes more successful. The Service Writer model is different.</p><p>You pay for the software and network membership that help operate and grow your business. Service Writer does not need to take a commission from every completed marketplace job.</p><Checklist items={["No percentage taken from your labor", "No percentage taken from your parts", "No penalty for increasing your average ticket", "No bidding against other providers for the same lead", "No separate fee every time a customer books"]} /><p>Your business performs the work. Your business keeps the service revenue, subject only to normal payment-processing charges and any clearly disclosed optional services.</p></Section>

      <div className="grid gap-8 lg:grid-cols-2"><Section eyebrow="Who it is for" title="Built for Independent Automotive Providers"><Checklist items={providerTypes} /><p>Providers may enroll in one or more service categories when they meet the applicable qualifications and have the capacity to serve customers reliably.</p></Section><Section eyebrow="Balanced markets" title="Controlled Enrollment Protects the Network"><p>Service Writer is not trying to place an unlimited number of providers in every market. Too many providers in one category can reduce opportunity, create inconsistent service and weaken the value of membership.</p><Checklist items={enrollmentFactors} /><p>Some categories or territories may have limited availability, a waiting list or additional qualification requirements.</p></Section></div>

      <Section eyebrow="Customer-first matching" title="Fair Customer Distribution" dark><p>Paying for Service Writer does not guarantee every provider the same number of customers or a specific amount of revenue. Customer opportunities may be distributed using factors such as:</p><Checklist items={distributionFactors} /><p>Service Writer’s priority is to connect the customer with a qualified provider who can complete the requested service reliably. Providers cannot simply purchase the top position for every customer search.</p></Section>

      <Section eyebrow="Measurable activity" title="Know What the Network Is Producing"><p>Participating providers may receive reporting that shows how the collective marketplace is performing. Depending on plan and market availability, reporting may include:</p><Checklist items={reporting} /><p>Collective advertising contributions are pooled. An individual provider’s payment is not assigned exclusively to campaigns for that provider, and advertising activity may vary by market, category, season and available customer demand.</p></Section>

      <section className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]"><div className="border-[4px] border-black p-8" style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadowLg }}><TrendingUp className="h-12 w-12" /><h2 className="mt-8 text-4xl font-black leading-tight" style={hankenStack}>A Better Alternative to Going It Alone</h2></div><div className="space-y-5 text-lg leading-8"><p>Independent providers are often forced to choose between expensive advertising agencies, unpredictable lead platforms and marketplaces that take a percentage of every job. Service Writer creates another option.</p><Checklist items={["Business-management software", "A consumer automotive marketplace", "Collective advertising power", "Local independent service providers", "Centralized booking and attribution", "Territory and category management"]} /><p className="font-bold">The result is a network that can compete for customer attention at a scale most independent providers cannot reach alone.</p></div></section>

      <Section eyebrow="A destination for automotive service" title="Help Build the Automotive Service Network Customers Already Need"><p>Customers should not have to search through dozens of websites, call multiple shops and wait for someone to answer just to schedule automotive service. They should be able to enter their location, select their vehicle, choose a service and book a qualified provider.</p><p>Service Writer is building that destination. The providers who power the network remain independent. They control their services, schedules, pricing, teams and customer experience while benefiting from shared technology and collective market reach.</p><Link to="/signup" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>Apply to Join the Network <ArrowRight className="h-4 w-4" /></Link></Section>

      <section><div className="mb-8 flex items-center gap-4"><ShieldCheck className="h-10 w-10" style={{ color: PRIMARY }} /><h2 className="text-4xl font-black" style={hankenStack}>Frequently Asked Questions</h2></div><div className="divide-y-[3px] divide-black border-[4px] border-black bg-white">{faqs.map(([question, answer]) => <details key={question} className="group p-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-lg font-black" style={hankenStack}>{question}<span className="text-2xl group-open:rotate-45">+</span></summary><p className="mt-4 max-w-4xl leading-7 text-black/65">{answer}</p></details>)}</div></section>

      <section className="border-[4px] border-black bg-black p-8 text-center text-white sm:p-14" style={hardShadowLg}><p className="text-xs font-bold uppercase tracking-[.2em]" style={{ ...monoStack, color: PRIMARY_CONTAINER }}>Build with us</p><h2 className="mx-auto mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl" style={hankenStack}>Your Business Stays Independent. Your Advertising Power Does Not Have To.</h2><p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/70">Join the operating system and collective marketplace built to help independent automotive providers compete at a larger scale.</p><div className="mt-8 flex flex-wrap justify-center gap-4"><Link to="/signup" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, color: "black", ...hardShadow }}>Join Service Writer</Link><Link to="/contact" className={neoBtn} style={{ backgroundColor: "white", color: "black", ...hardShadow }}>Check Availability in Your Area</Link></div><p className="mx-auto mt-10 max-w-4xl text-xs leading-5 text-white/50">Service Writer membership, marketplace eligibility and network benefits are subject to approval, plan availability, provider qualifications and applicable terms. Collective advertising does not guarantee impressions, leads, bookings, revenue or exclusive territory. Advertising channels and campaign availability may change based on budget, market readiness and network strategy.</p></section>
    </div>
  </MarketingLayout>;
}
