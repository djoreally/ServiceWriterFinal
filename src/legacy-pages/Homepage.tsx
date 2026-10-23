import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { MarketingLayout, PRIMARY, PRIMARY_CONTAINER, hardShadow, hardShadowLg, hankenStack, monoStack, neoBtn } from "@/components/marketing/MarketingLayout";
import { FLOW, FREE_CORE, FREE_SOLO_NOTE, HOMEPAGE_AUDIENCE_LINE, HOMEPAGE_HEADLINE, HOMEPAGE_PROOF_DETAIL, HOMEPAGE_PROOF_LINE, HOMEPAGE_SUBHEAD, PAID_TIERS } from "./homepageContent";

function useHomepageMeta() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Service Writer | Run Your Shop for Free";
    const description = "Shop software for mobile oil change operators, shops, and mobile mechanics. Booking, estimates, scheduling, jobs, and basic invoicing. Free to start.";
    const setMeta = (selector: string, attr: string, name: string, content: string) => { let node = document.head.querySelector(selector) as HTMLMetaElement | null; if (!node) { node = document.createElement("meta"); node.setAttribute(attr, name); document.head.appendChild(node); } node.setAttribute("content", content); };
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", "Service Writer | Run Your Shop for Free");
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    return () => { document.title = previousTitle; };
  }, []);
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-9">
      <span className="uppercase text-xs tracking-widest" style={{ ...monoStack, color: PRIMARY }}>{eyebrow}</span>
      <h2 className="text-4xl md:text-6xl font-black mt-3" style={{ ...hankenStack, letterSpacing: "-0.04em", lineHeight: 1.04 }}>{title}</h2>
    </div>
  );
}

export default function Homepage() {
  useHomepageMeta();
  return <MarketingLayout>
    <header className="max-w-5xl mx-auto text-center pt-8 md:pt-16 mb-24 md:mb-32">
      <div className="inline-flex items-center gap-2 border-[3px] border-black bg-white px-4 py-2 mb-7" style={hardShadow}><span className="uppercase text-[10px] tracking-widest" style={{ ...monoStack, color: PRIMARY }}>Service Writer</span></div>
      <h1 className="font-black mb-7 text-black" style={{ ...hankenStack, fontSize: "clamp(46px, 8vw, 88px)", lineHeight: .98, letterSpacing: "-0.055em" }}>{HOMEPAGE_HEADLINE}</h1>
      <p className="text-lg md:text-2xl max-w-3xl mx-auto mb-9" style={{ color: "#4b4b4b", lineHeight: 1.55 }}>{HOMEPAGE_SUBHEAD}</p>
      <div className="flex flex-col sm:flex-row justify-center gap-3"><Link to="/signup" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>Get started <ArrowRight className="w-4 h-4" /></Link><a href="#free" className={neoBtn} style={{ backgroundColor: "#fff", ...hardShadow }}>See what&apos;s free</a></div>
      <p className="mt-8 text-sm font-semibold" style={{ color: "#333" }}>{HOMEPAGE_PROOF_LINE}</p>
      <p className="mt-2 text-base max-w-xl mx-auto" style={{ color: "#4b4b4b", lineHeight: 1.55 }}>{HOMEPAGE_PROOF_DETAIL}</p>
    </header>

    <section className="mb-24 md:mb-32">
      <SectionHeading eyebrow="How it works" title="One job, start to finish." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">{FLOW.map(([number, title, copy]) => <article key={number} className="border-[4px] border-black bg-white p-5 text-black" style={hardShadow}><span className="text-3xl font-black" style={{ ...monoStack, color: PRIMARY }}>{number}</span><h3 className="text-xl font-black mt-5 mb-2" style={hankenStack}>{title}</h3><p className="text-sm text-neutral-600 leading-relaxed">{copy}</p></article>)}</div>
      <p className="mt-7 text-center text-lg font-bold" style={hankenStack}>Book → Estimate → Schedule → Job → Invoice</p>
    </section>

    <section className="mb-24 md:mb-32">
      <SectionHeading eyebrow="See it" title="See the workspace." />
      <p className="text-lg text-neutral-600 leading-relaxed mb-7 max-w-3xl">Screenshots from the real workspace. Customer details blurred.</p>
      <div className="grid md:grid-cols-3 gap-5">
        <figure className="border-[4px] border-black bg-white p-3" style={hardShadow}><img src="/homepage-dashboard-redacted.png" alt="Service Writer dashboard showing the day at a glance" className="w-full" loading="lazy" /><figcaption className="text-sm font-semibold mt-3">The dashboard. The day at a glance.</figcaption></figure>
        <figure className="border-[4px] border-black bg-white p-3" style={hardShadow}><img src="/homepage-job-detail-redacted.png" alt="Service Writer job detail with vehicle specs and service details" className="w-full" loading="lazy" /><figcaption className="text-sm font-semibold mt-3">The job. Specs, services, and closeout in one place.</figcaption></figure>
        <figure className="border-[4px] border-black bg-white p-3" style={hardShadow}><img src="/homepage-schedule-redacted.png" alt="Service Writer calendar showing the month of appointments" className="w-full" loading="lazy" /><figcaption className="text-sm font-semibold mt-3">The calendar. The week laid out.</figcaption></figure>
      </div>
    </section>

    <section id="free" className="mb-24 md:mb-32">
      <SectionHeading eyebrow="Free / $0" title="What is free." />
      <div className="border-[4px] border-black bg-white p-6 md:p-9 text-black" style={hardShadowLg}><p className="text-lg text-neutral-600 leading-relaxed mb-7">The core runs the everyday job. No customer limits. No vehicle limits. No appointment limits.</p><div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">{FREE_CORE.map(item => <div key={item} className="flex gap-2 items-start"><Check className="w-5 h-5 shrink-0 mt-0.5" style={{ color: PRIMARY }} strokeWidth={3} /><span className="text-sm font-semibold">{item}</span></div>)}</div><p className="mt-7 text-sm font-semibold" style={{ color: "#333" }}>{FREE_SOLO_NOTE}</p></div>
    </section>

    <section className="mb-24 md:mb-32">
      <SectionHeading eyebrow="Paid plans" title="What costs money." />
      <p className="text-lg text-neutral-600 leading-relaxed mb-7 max-w-3xl">Pay when you need more than the core. Prices match the pricing page.</p>
      <div className="grid md:grid-cols-3 gap-5">{PAID_TIERS.map(tier => <div key={tier.name} className="border-[4px] border-black bg-white p-6 md:p-8" style={hardShadowLg}><h3 className="text-2xl font-black mb-1" style={hankenStack}>{tier.name}</h3><p className="text-lg font-bold mb-4" style={{ color: PRIMARY }}>{tier.price}</p><p className="text-neutral-600 leading-relaxed">{tier.includes}</p></div>)}</div>
    </section>

    <section className="mb-24 md:mb-32">
      <SectionHeading eyebrow="Proof" title="Built by one shop. Running one shop." />
      <div className="max-w-3xl"><p className="text-lg leading-relaxed" style={{ color: "#4b4b4b", lineHeight: 1.6 }}>Service Writer was built by the owner of MOMS Mobile Oil Change, and that shop runs on it. There is one shop on it so far. That is the whole story. No made-up customer counts. No fake reviews.</p><p className="text-lg leading-relaxed mt-4" style={{ color: "#4b4b4b", lineHeight: 1.6 }}>{HOMEPAGE_AUDIENCE_LINE}</p></div>
    </section>

    <section className="border-[4px] border-black p-8 md:p-14 text-center mb-8" style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadowLg }}><h2 className="text-4xl md:text-6xl font-black mb-5" style={{ ...hankenStack, lineHeight: 1.02, letterSpacing: "-0.04em" }}>Run the business. Then grow it.</h2><p className="max-w-2xl mx-auto mb-8 text-lg leading-relaxed">Sign up in minutes and set up your own workspace — no sales call required. Then add your services and run your first live job.</p><Link to="/signup" className={neoBtn} style={{ backgroundColor: "#fff", ...hardShadow }}>Create your account <ArrowRight className="w-4 h-4" /></Link></section>
  </MarketingLayout>;
}
