/**
 * Server-rendered homepage for "/" (anonymous visitors on the apex host).
 *
 * This is the fast path: it renders to HTML on the server, so first paint
 * does not wait for the legacy SPA bundle, auth, or tenant resolution.
 * Copy comes from `src/legacy-pages/homepageContent.ts` (shared with the
 * legacy SPA Homepage) so the two render paths cannot drift apart.
 *
 * Server-safe by construction: no react-router, no hooks, no `document`.
 * Links are plain anchors. The mobile menu is a static stacked link row
 * instead of the SPA's JS hamburger — no client JS is needed for this page.
 *
 * Design: light backgrounds only. No dark blocks, no black heading bars,
 * no product image. The old page showed a dark phone mockup with fake
 * customer initials and fake dollar amounts. That image is gone.
 */

import {
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE,
  SURFACE_DIM,
  hardShadow,
  hardShadowLg,
  hankenStack,
  interStack,
  monoStack,
  neoBtn,
} from "./marketingTheme";
import {
  FLOW,
  FREE_CORE,
  FREE_SOLO_NOTE,
  HOMEPAGE_AUDIENCE_LINE,
  HOMEPAGE_HEADLINE,
  HOMEPAGE_PROOF_DETAIL,
  HOMEPAGE_PROOF_LINE,
  HOMEPAGE_SUBHEAD,
  PAID_TIERS,
} from "@/legacy-pages/homepageContent";

const NAV_LINKS = [
  { to: "/how-it-works", label: "How It Works" },
  { to: "/features-guide", label: "Features" },
  { to: "/tire", label: "Tire" },
  { to: "/detailers", label: "Detailers" },
  { to: "/pricing", label: "Pricing" },
  { to: "/find-provider", label: "Find Provider" },
  { to: "/faqs", label: "FAQs" },
];

function ServerNav() {
  return (
    <nav
      className="w-full top-0 sticky z-50 border-b-[4px] border-black"
      style={{ backgroundColor: SURFACE }}
    >
      <div className="flex justify-between items-center h-20 px-6 max-w-[1200px] mx-auto">
        <a href="/" className="flex items-center gap-3">
          <span
            className="w-10 h-10 border-[3px] border-black flex items-center justify-center text-xl font-black"
            style={{ backgroundColor: PRIMARY_CONTAINER, boxShadow: "3px 3px 0px #000" }}
          >
            W
          </span>
          <span className="text-2xl font-black uppercase tracking-tighter" style={hankenStack}>
            Service Writer
          </span>
        </a>
        <div className="hidden xl:flex items-center gap-5 text-sm">
          {NAV_LINKS.map((link) => (
            <a key={link.to} href={link.to} className="font-medium hover:opacity-70 transition">
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex gap-4 items-center">
          <a
            href="/login"
            className={neoBtn}
            style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow, fontSize: "0.875rem" }}
          >
            Login
          </a>
        </div>
      </div>
      <div className="xl:hidden border-t-[3px] border-black bg-white px-6 py-4">
        <div className="flex flex-wrap gap-2">
          {NAV_LINKS.map((link) => (
            <a
              key={link.to}
              href={link.to}
              className="border-[3px] border-black px-3 py-2 text-xs font-black uppercase tracking-wide"
              style={{ backgroundColor: SURFACE }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

function ServerFooter() {
  return (
    <footer className="border-t-[4px] border-black bg-white">
      <div className="max-w-[1200px] mx-auto px-6 py-12 grid md:grid-cols-4 gap-8 text-sm">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span
              className="w-8 h-8 border-[3px] border-black flex items-center justify-center font-black"
              style={{ backgroundColor: PRIMARY_CONTAINER }}
            >
              W
            </span>
            <span className="font-black uppercase" style={hankenStack}>
              Service Writer
            </span>
          </div>
          <p style={{ color: "#5e5e5e" }}>
            Shop software for mobile oil change operators, independent shops, tire operators,
            detailers, mobile teams, and fleet providers.
          </p>
        </div>
        <div>
          <div className="font-black uppercase mb-3" style={hankenStack}>
            Product
          </div>
          <ul className="space-y-2" style={{ color: "#5e5e5e" }}>
            <li><a href="/how-it-works">How It Works</a></li>
            <li><a href="/features-guide">Features</a></li>
            <li><a href="/pricing">Pricing</a></li>
            <li><a href="/find-provider">Find Provider</a></li>
            <li><a href="/advertising-network">Advertising Network</a></li>
            <li><a href="/faqs">FAQs</a></li>
          </ul>
        </div>
        <div>
          <div className="font-black uppercase mb-3" style={hankenStack}>
            Built For
          </div>
          <ul className="space-y-2" style={{ color: "#5e5e5e" }}>
            <li><a href="/tire">Tire Businesses</a></li>
            <li><a href="/detailers">Detailers</a></li>
            <li><a href="/about">About</a></li>
            <li><a href="/partner-program">Partner Program</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/support">Support</a></li>
          </ul>
        </div>
        <div>
          <div className="font-black uppercase mb-3" style={hankenStack}>
            Legal
          </div>
          <ul className="space-y-2" style={{ color: "#5e5e5e" }}>
            <li><a href="/privacy-policy">Privacy</a></li>
            <li><a href="/terms">Terms</a></li>
            <li><a href="/security">Security</a></li>
          </ul>
        </div>
      </div>
      <div
        className="border-t-2 border-black/10 max-w-[1200px] mx-auto px-6 py-4 text-xs"
        style={{ color: "#5e5e5e" }}
      >
        © {new Date().getFullYear()} Service Writer
      </div>
    </footer>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-9">
      <span className="uppercase text-xs tracking-widest" style={{ ...monoStack, color: PRIMARY }}>
        {eyebrow}
      </span>
      <h2
        className="text-4xl md:text-6xl font-black mt-3"
        style={{ ...hankenStack, letterSpacing: "-0.04em", lineHeight: 1.04 }}
      >
        {title}
      </h2>
    </div>
  );
}

export default function ServerHomepage() {
  return (
    <div
      className="min-h-screen text-black flex flex-col"
      style={{
        ...interStack,
        backgroundColor: SURFACE,
        backgroundImage: `radial-gradient(${SURFACE_DIM} 1.5px, transparent 1.5px)`,
        backgroundSize: "24px 24px",
      }}
    >
      <ServerNav />
      <main className="flex-1 max-w-[1200px] mx-auto px-6 py-16 w-full">
        {/* Hero */}
        <header className="max-w-5xl mx-auto text-center pt-8 md:pt-16 mb-24 md:mb-32">
          <div
            className="inline-flex items-center gap-2 border-[3px] border-black bg-white px-4 py-2 mb-7"
            style={hardShadow}
          >
            <span className="uppercase text-[10px] tracking-widest" style={{ ...monoStack, color: PRIMARY }}>
              Service Writer
            </span>
          </div>
          <h1
            className="font-black mb-7 text-black"
            style={{ ...hankenStack, fontSize: "clamp(46px, 8vw, 88px)", lineHeight: 0.98, letterSpacing: "-0.055em" }}
          >
            {HOMEPAGE_HEADLINE}
          </h1>
          <p
            className="text-lg md:text-2xl max-w-3xl mx-auto mb-9"
            style={{ color: "#4b4b4b", lineHeight: 1.55 }}
          >
            {HOMEPAGE_SUBHEAD}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <a href="/signup" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>
              Get started <span aria-hidden="true">→</span>
            </a>
            <a href="#free" className={neoBtn} style={{ backgroundColor: "#fff", ...hardShadow }}>
              See what&apos;s free
            </a>
          </div>
          <p className="mt-8 text-sm font-semibold" style={{ color: "#333" }}>
            {HOMEPAGE_PROOF_LINE}
          </p>
          <p className="mt-2 text-base max-w-xl mx-auto" style={{ color: "#4b4b4b", lineHeight: 1.55 }}>
            {HOMEPAGE_PROOF_DETAIL}
          </p>
        </header>

        {/* How a job runs */}
        <section className="mb-24 md:mb-32">
          <SectionHeading eyebrow="How it works" title="One job, start to finish." />
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {FLOW.map(([number, title, copy]) => (
              <article key={number} className="border-[4px] border-black bg-white p-5 text-black" style={hardShadow}>
                <span className="text-3xl font-black" style={{ ...monoStack, color: PRIMARY }}>
                  {number}
                </span>
                <h3 className="text-xl font-black mt-5 mb-2" style={hankenStack}>
                  {title}
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{copy}</p>
              </article>
            ))}
          </div>
          <p className="mt-7 text-center text-lg font-bold" style={hankenStack}>
            Book → Estimate → Schedule → Job → Invoice
          </p>
        </section>

        {/* See the workspace */}
        <section className="mb-24 md:mb-32">
          <SectionHeading eyebrow="See it" title="See the workspace." />
          <p className="text-lg text-neutral-600 leading-relaxed mb-7 max-w-3xl">
            Screenshots from the real workspace. Customer details blurred.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            <figure className="border-[4px] border-black bg-white p-3" style={hardShadow}>
              <img src="/homepage-dashboard-redacted.png" alt="Service Writer dashboard showing the day at a glance" className="w-full" loading="lazy" />
              <figcaption className="text-sm font-semibold mt-3">The dashboard. The day at a glance.</figcaption>
            </figure>
            <figure className="border-[4px] border-black bg-white p-3" style={hardShadow}>
              <img src="/homepage-job-detail-redacted.png" alt="Service Writer job detail with vehicle specs and service details" className="w-full" loading="lazy" />
              <figcaption className="text-sm font-semibold mt-3">The job. Specs, services, and closeout in one place.</figcaption>
            </figure>
            <figure className="border-[4px] border-black bg-white p-3" style={hardShadow}>
              <img src="/homepage-schedule-redacted.png" alt="Service Writer calendar showing the month of appointments" className="w-full" loading="lazy" />
              <figcaption className="text-sm font-semibold mt-3">The calendar. The week laid out.</figcaption>
            </figure>
          </div>
        </section>

        {/* What is free */}
        <section id="free" className="mb-24 md:mb-32">
          <SectionHeading eyebrow="Free / $0" title="What is free." />
          <div className="border-[4px] border-black bg-white p-6 md:p-9 text-black" style={hardShadowLg}>
            <p className="text-lg text-neutral-600 leading-relaxed mb-7">
              The core runs the everyday job. No customer limits. No vehicle limits.
              No appointment limits.
            </p>
            <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
              {FREE_CORE.map((item) => (
                <div key={item} className="flex gap-2 items-start">
                  <span className="shrink-0 mt-0.5 font-black" style={{ color: PRIMARY }}>
                    ✓
                  </span>
                  <span className="text-sm font-semibold">{item}</span>
                </div>
              ))}
            </div>
            <p className="mt-7 text-sm font-semibold" style={{ color: "#333" }}>
              {FREE_SOLO_NOTE}
            </p>
          </div>
        </section>

        {/* What costs money */}
        <section className="mb-24 md:mb-32">
          <SectionHeading eyebrow="Paid plans" title="What costs money." />
          <p className="text-lg text-neutral-600 leading-relaxed mb-7 max-w-3xl">
            Pay when you need more than the core. Prices match the pricing page.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {PAID_TIERS.map((tier) => (
              <div key={tier.name} className="border-[4px] border-black bg-white p-6 md:p-8" style={hardShadowLg}>
                <h3 className="text-2xl font-black mb-1" style={hankenStack}>
                  {tier.name}
                </h3>
                <p className="text-lg font-bold mb-4" style={{ color: PRIMARY }}>
                  {tier.price}
                </p>
                <p className="text-neutral-600 leading-relaxed">{tier.includes}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Proof */}
        <section className="mb-24 md:mb-32">
          <SectionHeading eyebrow="Proof" title="Built by one shop. Running one shop." />
          <div className="max-w-3xl">
            <p className="text-lg leading-relaxed" style={{ color: "#4b4b4b", lineHeight: 1.6 }}>
              Service Writer was built by the owner of MOMS Mobile Oil Change, and that shop
              runs on it. There is one shop on it so far. That is the whole story.
              No made-up customer counts. No fake reviews.
            </p>
            <p className="text-lg leading-relaxed mt-4" style={{ color: "#4b4b4b", lineHeight: 1.6 }}>
              {HOMEPAGE_AUDIENCE_LINE}
            </p>
          </div>
        </section>

        {/* Closing CTA */}
        <section
          className="border-[4px] border-black p-8 md:p-14 text-center mb-8"
          style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadowLg }}
        >
          <h2
            className="text-4xl md:text-6xl font-black mb-5"
            style={{ ...hankenStack, lineHeight: 1.02, letterSpacing: "-0.04em" }}
          >
            Run the business. Then grow it.
          </h2>
          <p className="max-w-2xl mx-auto mb-8 text-lg leading-relaxed">
            Sign up in minutes and set up your own workspace — no sales call required.
            Then add your services and run your first live job.
          </p>
          <a href="/signup" className={neoBtn} style={{ backgroundColor: "#fff", ...hardShadow }}>
            Create your account <span aria-hidden="true">→</span>
          </a>
        </section>
      </main>
      <ServerFooter />
    </div>
  );
}
