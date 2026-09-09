import { Link } from "react-router-dom";
import { ArrowRight, Check, MapPin, Megaphone, ShieldCheck, WalletCards } from "lucide-react";
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

const providerBenefits = [
  "Keep your business name and brand",
  "Use your own Stripe account",
  "Keep your service revenue",
  "Choose the services and areas you cover",
  "Receive marketplace-attributed bookings in Service Writer",
  "See measured marketplace performance as reporting becomes available",
];

const plannedModel = [
  ["Local market cells", "Marketing is intended to run where participating providers have enough service coverage and appointment capacity—not as one undifferentiated nationwide campaign."],
  ["Shared marketing contribution", "The planned co-op uses a fixed monthly marketing contribution. Final pricing and launch markets have not been announced."],
  ["Small completed-booking fee", "The current blueprint models a small fixed technology fee per completed marketplace-attributed booking rather than a percentage of the provider's service ticket."],
  ["Provider-owned payments", "Normal customer service payments are intended to settle through the provider's own payment account. Marketplace attribution and provider payment ownership are separate concepts."],
];

const faqs = [
  ["Is the Marketplace Marketing Co-op live today?", "The provider directory and marketplace-related product surfaces already exist, but the full co-op marketing program, market-cell budget engine, provider statements and AI marketing operations are still being built and certified."],
  ["Does Service Writer take a percentage of marketplace jobs?", "The planned co-op model is not based on a percentage commission on ordinary provider service revenue. The current blueprint uses a fixed marketing contribution plus a small fixed fee for qualifying completed marketplace bookings."],
  ["What is the booking fee?", "The current product blueprint models approximately $0.25 per qualifying completed marketplace booking. Final commercial terms will be published before enrollment opens."],
  ["Will my co-op payment be spent only on my business?", "The planned system groups participating providers into local market cells and measures market-level activity. Final allocation rules will be disclosed before paid enrollment opens."],
  ["Does joining guarantee leads or revenue?", "No. Marketplace demand, advertising performance and booking volume cannot be guaranteed. The system is being designed to avoid buying demand in markets that lack sufficient provider supply or capacity."],
  ["Can I keep running my own advertising?", "Yes. Participating providers remain independent businesses and can continue marketing their own companies."],
];

export default function AdvertisingNetwork() {
  return (
    <MarketingLayout>
      <div className="space-y-16">
        <header className="grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 border-[3px] border-black bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest" style={hardShadow}>
              <Megaphone className="h-4 w-4" /> Marketplace Marketing Co-op
            </div>
            <h1 className="font-black uppercase leading-[.92] tracking-[-0.055em]" style={{ ...hankenStack, fontSize: "clamp(52px, 8vw, 96px)" }}>
              Grow Local.<br /><span style={{ color: PRIMARY }}>Keep Your</span><br />Business.
            </h1>
            <p className="mt-7 max-w-2xl text-xl font-bold leading-8">Service Writer is building a local marketing co-op for independent automotive service providers.</p>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-black/65">Your business stays independent. Your brand stays yours. Your normal service payments stay in your payment account. The co-op is designed to pool marketing power without taking a percentage of every job.</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/contact" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>Marketplace enrollment opening soon <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/find-provider" className={neoBtn} style={{ backgroundColor: "white", ...hardShadow }}>Browse current providers</Link>
            </div>
          </div>

          <div className="border-[4px] border-black bg-black p-8 text-white" style={hardShadowLg}>
            <MapPin className="h-14 w-14" style={{ color: PRIMARY_CONTAINER }} />
            <p className="mt-8 text-sm font-bold uppercase tracking-[.18em]" style={{ ...monoStack, color: PRIMARY_CONTAINER }}>Designed for local demand</p>
            <p className="mt-4 text-3xl font-black leading-tight" style={hankenStack}>Market by market.<br />Capacity before spend.</p>
            <p className="mt-5 leading-7 text-white/70">The planned system activates customer acquisition around real provider coverage, services and capacity instead of blasting one campaign across the entire country.</p>
          </div>
        </header>

        <section className="border-[4px] border-black bg-white p-7 sm:p-10" style={hardShadowLg}>
          <p className="text-xs font-bold uppercase tracking-[.2em]" style={{ ...monoStack, color: PRIMARY }}>The model</p>
          <h2 className="mt-3 text-3xl font-black sm:text-4xl" style={hankenStack}>Your business. Your brand. Your Stripe account.</h2>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            {providerBenefits.map((item) => (
              <div key={item} className="flex items-start gap-3 border-[3px] border-black p-4">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 border-black" style={{ backgroundColor: PRIMARY_CONTAINER }}><Check className="h-3 w-3" strokeWidth={4} /></span>
                <span className="font-semibold">{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="text-xs font-bold uppercase tracking-[.2em]" style={{ ...monoStack, color: PRIMARY }}>Planned operating model</p>
          <h2 className="mt-3 text-4xl font-black sm:text-5xl" style={hankenStack}>A co-op, not a commission marketplace.</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {plannedModel.map(([title, text], index) => (
              <article key={title} className="border-[4px] border-black bg-white p-6" style={hardShadow}>
                <span className="text-sm font-black" style={{ ...monoStack, color: PRIMARY }}>0{index + 1}</span>
                <h3 className="mt-3 text-xl font-black" style={hankenStack}>{title}</h3>
                <p className="mt-3 leading-7 text-black/65">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="border-[4px] border-black p-8" style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadowLg }}>
            <WalletCards className="h-12 w-12" />
            <h2 className="mt-7 text-4xl font-black leading-tight" style={hankenStack}>No percentage tax on your success.</h2>
            <p className="mt-5 leading-7">The planned marketplace economics are a fixed marketing contribution plus a small fixed fee for qualifying completed marketplace bookings—not a percentage of your labor, parts or ticket size.</p>
          </div>
          <div className="border-[4px] border-black bg-black p-8 text-white" style={hardShadowLg}>
            <ShieldCheck className="h-12 w-12" style={{ color: PRIMARY_CONTAINER }} />
            <h2 className="mt-7 text-4xl font-black leading-tight" style={hankenStack}>What is live vs. what is planned.</h2>
            <p className="mt-5 leading-7 text-white/75">Service Writer already contains marketplace/provider-directory surfaces. The paid co-op program, market-cell budget allocation, monthly co-op statements and AI marketing operations are not being represented as live until they are implemented and production-certified.</p>
          </div>
        </section>

        <section>
          <div className="mb-8 flex items-center gap-4"><ShieldCheck className="h-10 w-10" style={{ color: PRIMARY }} /><h2 className="text-4xl font-black" style={hankenStack}>Frequently Asked Questions</h2></div>
          <div className="divide-y-[3px] divide-black border-[4px] border-black bg-white">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group p-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-lg font-black" style={hankenStack}>{question}<span className="text-2xl group-open:rotate-45">+</span></summary>
                <p className="mt-4 max-w-4xl leading-7 text-black/65">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="border-[4px] border-black bg-black p-8 text-center text-white sm:p-14" style={hardShadowLg}>
          <p className="text-xs font-bold uppercase tracking-[.2em]" style={{ ...monoStack, color: PRIMARY_CONTAINER }}>Opening in stages</p>
          <h2 className="mx-auto mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl" style={hankenStack}>Marketplace provider enrollment is opening soon.</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/70">We are documenting and certifying the operating model before accepting paid co-op participation. No guaranteed leads, fake market counts or invented performance claims.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link to="/contact" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, color: "black", ...hardShadow }}>Talk to Service Writer</Link>
            <Link to="/find-provider" className={neoBtn} style={{ backgroundColor: "white", color: "black", ...hardShadow }}>Find a provider</Link>
          </div>
        </section>
      </div>
    </MarketingLayout>
  );
}
