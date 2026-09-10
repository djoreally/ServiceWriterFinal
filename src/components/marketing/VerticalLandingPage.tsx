import Link from "next/link";
import { ArrowRight, Check, CreditCard, Image as ImageIcon, MapPin, Users, Wrench } from "lucide-react";

type VerticalLandingPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  proofLine: string;
  capabilities: string[];
  workflow: Array<{ title: string; copy: string }>;
  growthTitle: string;
  growthCopy: string;
};

const PRIMARY = "#596400";
const ACCENT = "#e5ff00";
const hardShadow = { boxShadow: "5px 5px 0 #000" };
const hardShadowLg = { boxShadow: "9px 9px 0 #000" };

export default function VerticalLandingPage({
  eyebrow,
  title,
  intro,
  proofLine,
  capabilities,
  workflow,
  growthTitle,
  growthCopy,
}: VerticalLandingPageProps) {
  return (
    <main className="min-h-screen bg-[#fbf9f8] text-black">
      <nav className="sticky top-0 z-50 border-b-4 border-black bg-[#fbf9f8]">
        <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3 font-black uppercase tracking-tight">
            <span className="flex h-10 w-10 items-center justify-center border-[3px] border-black" style={{ backgroundColor: ACCENT, boxShadow: "3px 3px 0 #000" }}><Wrench className="h-5 w-5" /></span>
            <span className="text-xl sm:text-2xl">Service Writer</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="hidden font-bold sm:inline">Pricing</Link>
            <Link href="/signup" className="border-[3px] border-black px-4 py-2 font-black uppercase" style={{ backgroundColor: ACCENT, ...hardShadow }}>Start Free</Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-[1200px] px-6 py-14 sm:py-20">
        <header className="grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <div className="mb-6 inline-flex border-[3px] border-black bg-white px-4 py-2 text-xs font-black uppercase tracking-[.18em]" style={hardShadow}>{eyebrow}</div>
            <h1 className="max-w-4xl text-5xl font-black leading-[.94] tracking-[-.05em] sm:text-7xl lg:text-8xl">{title}</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-black/65 sm:text-xl">{intro}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/signup" className="inline-flex items-center gap-2 border-4 border-black px-6 py-3 font-black uppercase" style={{ backgroundColor: ACCENT, ...hardShadow }}>Start Free <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/features-guide" className="inline-flex items-center gap-2 border-4 border-black bg-white px-6 py-3 font-black uppercase" style={hardShadow}>See the platform</Link>
            </div>
            <p className="mt-5 text-sm font-bold">Basic is free. Upgrade when your operation needs technicians, fleet workflows, or integrated payments.</p>
          </div>

          <div className="border-4 border-black bg-black p-7 text-white sm:p-9" style={hardShadowLg}>
            <p className="text-xs font-black uppercase tracking-[.2em]" style={{ color: ACCENT }}>One operating system</p>
            <h2 className="mt-5 text-4xl font-black leading-tight">Built around the work you already do.</h2>
            <div className="mt-8 grid gap-3">
              {["Booking & scheduling", "Customers & vehicles", "Photos & service records", "Quotes & invoices", "Technician workflows", "Payments & reconciliation"].map((item) => <div key={item} className="flex items-center gap-3 border-2 border-white/30 px-4 py-3"><Check className="h-4 w-4 shrink-0" style={{ color: ACCENT }} /><span>{item}</span></div>)}
            </div>
          </div>
        </header>

        <section className="mt-24 sm:mt-32">
          <p className="text-xs font-black uppercase tracking-[.2em]" style={{ color: PRIMARY }}>Already in Service Writer</p>
          <h2 className="mt-3 max-w-4xl text-4xl font-black tracking-[-.04em] sm:text-6xl">Not a stripped-down vertical app. The full operating platform, focused on your business.</h2>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-black/65">{proofLine}</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability) => <div key={capability} className="flex items-start gap-3 border-[3px] border-black bg-white p-5" style={hardShadow}><Check className="mt-0.5 h-5 w-5 shrink-0" style={{ color: PRIMARY }} /><span className="font-bold">{capability}</span></div>)}
          </div>
        </section>

        <section className="mt-24 grid gap-6 lg:grid-cols-4 sm:mt-32">
          {workflow.map((step, index) => <article key={step.title} className="border-4 border-black bg-white p-6" style={hardShadow}><span className="text-3xl font-black" style={{ color: PRIMARY }}>0{index + 1}</span><h3 className="mt-6 text-2xl font-black">{step.title}</h3><p className="mt-3 leading-7 text-black/60">{step.copy}</p></article>)}
        </section>

        <section className="mt-24 grid gap-8 lg:grid-cols-3 sm:mt-32">
          <div className="border-4 border-black p-7" style={{ backgroundColor: ACCENT, ...hardShadowLg }}><Users className="h-9 w-9" /><h3 className="mt-8 text-3xl font-black">Grow without changing systems.</h3><p className="mt-4 leading-7">Start solo. Add Technician OS when you hire. Add Fleet OS when fleet accounts become part of the operation.</p></div>
          <div className="border-4 border-black bg-white p-7" style={hardShadowLg}><CreditCard className="h-9 w-9" /><h3 className="mt-8 text-3xl font-black">Payments stay yours.</h3><p className="mt-4 leading-7">Integrated Payments is optional. Connect your own Stripe account; Service Writer takes 0% of ordinary shop transactions.</p></div>
          <div className="border-4 border-black bg-white p-7" style={hardShadowLg}><ImageIcon className="h-9 w-9" /><h3 className="mt-8 text-3xl font-black">Keep the evidence with the job.</h3><p className="mt-4 leading-7">Photos, vehicle context, notes, service records, customer communication, invoices, and work history stay connected.</p></div>
        </section>

        <section className="mt-24 border-4 border-black bg-black p-8 text-white sm:mt-32 sm:p-12" style={hardShadowLg}>
          <MapPin className="h-9 w-9" style={{ color: ACCENT }} />
          <h2 className="mt-6 max-w-4xl text-4xl font-black tracking-[-.04em] sm:text-6xl">{growthTitle}</h2>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/70">{growthCopy}</p>
          <div className="mt-8 flex flex-wrap gap-4"><Link href="/signup" className="inline-flex items-center gap-2 border-4 border-white px-6 py-3 font-black uppercase text-black" style={{ backgroundColor: ACCENT }}>Start free <ArrowRight className="h-4 w-4" /></Link><Link href="/pricing" className="inline-flex items-center border-4 border-white px-6 py-3 font-black uppercase">See pricing</Link></div>
        </section>

        <div className="mt-16 flex flex-wrap gap-x-6 gap-y-3 border-t-2 border-black/10 pt-8 text-sm font-bold"><Link href="/">Service Writer</Link><Link href="/tire">Tire businesses</Link><Link href="/detailers">Detailers</Link><Link href="/features-guide">Features</Link><Link href="/pricing">Pricing</Link><Link href="/contact">Contact</Link></div>
      </div>
    </main>
  );
}
