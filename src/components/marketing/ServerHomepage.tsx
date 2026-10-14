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
  HOMEPAGE_AUDIENCE_LINE,
  HOMEPAGE_HEADLINE,
  HOMEPAGE_PROOF_LINE,
  HOMEPAGE_SUBHEAD,
  VALUE_ADD,
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
            One operating system for independent automotive service businesses, tire operators,
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
        <header className="max-w-5xl mx-auto text-center pt-8 md:pt-16 mb-24 md:mb-32">
          <div
            className="inline-flex items-center gap-2 border-[3px] border-black bg-white px-4 py-2 mb-7"
            style={hardShadow}
          >
            <span className="uppercase text-[10px] tracking-widest" style={{ ...monoStack, color: PRIMARY }}>
              Service Writer / Free Operational Core
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
              Start free <span aria-hidden="true">→</span>
            </a>
            <a href="#free-core" className={neoBtn} style={{ backgroundColor: "#fff", ...hardShadow }}>
              See what&apos;s free
            </a>
          </div>
          <p className="mt-5 text-xs uppercase tracking-wider" style={{ ...monoStack, color: "#666" }}>
            Start operating first. Add growth tools when they create value.
          </p>
          <p className="mt-3 text-sm font-semibold" style={{ color: "#333" }}>
            {HOMEPAGE_PROOF_LINE}
          </p>
          <figure className="mt-10 mx-auto max-w-sm border-[4px] border-black bg-white p-3" style={hardShadowLg}>
            {/* Preview image: a delivered redesign mockup, not a live production
                screenshot. Production dashboard requires login to capture. */}
            <img
              src="/homepage-jobs-preview.png"
              alt="Preview of the Service Writer jobs workspace"
              className="w-full h-auto block"
              width={780}
              height={1800}
            />
            <figcaption className="mt-2 text-xs uppercase tracking-wider" style={{ ...monoStack, color: "#666" }}>
              Preview of the workspace
            </figcaption>
          </figure>
        </header>

        <section className="mb-24 md:mb-32">
          <div className="flex items-center gap-4 mb-9">
            <h2
              className="uppercase tracking-widest bg-black px-5 py-2 text-xl md:text-2xl font-black"
              style={{ ...hankenStack, color: "#fff" }}
            >
              One complete job
            </h2>
            <div className="h-[4px] flex-grow bg-black" />
          </div>
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
          <div
            className="mt-7 border-[4px] border-black p-5 md:p-7 text-center"
            style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}
          >
            <p className="font-black text-xl md:text-3xl" style={hankenStack}>
              Customer → Vehicle → Estimate → Approval → Schedule → Job → Invoice → Payment → History
            </p>
          </div>
        </section>

        <section id="free-core" className="mb-24 md:mb-32 grid lg:grid-cols-2 gap-7 items-stretch">
          <div className="border-[4px] border-black bg-white p-6 md:p-9 text-black" style={hardShadowLg}>
            <div className="flex items-center gap-3 mb-3">
              <span className="uppercase text-xs tracking-widest" style={{ ...monoStack, color: PRIMARY }}>
                Free / $0 workspace
              </span>
            </div>
            <h2
              className="text-4xl md:text-6xl font-black mb-5"
              style={{ ...hankenStack, letterSpacing: "-0.04em", lineHeight: 1 }}
            >
              The operational core is free.
            </h2>
            <p className="text-lg text-neutral-600 leading-relaxed mb-7">
              If a feature is required to complete the everyday service workflow, it belongs in the
              foundation — not behind an artificial seat, customer, vehicle, or repair-order limit.
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
          </div>
          <div
            className="border-[4px] border-black p-6 md:p-9"
            style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadowLg }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="uppercase text-xs tracking-widest" style={monoStack}>
                Value-add expansion
              </span>
            </div>
            <h2
              className="text-4xl md:text-6xl font-black mb-5"
              style={{ ...hankenStack, letterSpacing: "-0.04em", lineHeight: 1 }}
            >
              Pay when Service Writer creates more value.
            </h2>
            <p className="text-lg leading-relaxed mb-7">
              Growth products monetize additional revenue, meaningful automation, advanced operations,
              or third-party infrastructure — not access to your own business data.
            </p>
            <div className="space-y-3">
              {VALUE_ADD.map((item) => (
                <div key={item} className="flex gap-2 items-start border-b-2 border-black/15 pb-3">
                  <span className="shrink-0 mt-0.5 font-black">→</span>
                  <span className="text-sm font-semibold">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-24 md:mb-32 text-black">
          <div className="max-w-3xl mb-9">
            <span className="uppercase text-xs tracking-widest" style={{ ...monoStack, color: PRIMARY }}>
              Built for the operator
            </span>
            <h2
              className="text-4xl md:text-6xl font-black mt-3"
              style={{ ...hankenStack, letterSpacing: "-0.04em", lineHeight: 1.04 }}
            >
              No data hostage traps.
            </h2>
            <p className="text-lg text-neutral-600 leading-relaxed mt-4">{HOMEPAGE_AUDIENCE_LINE}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            <div className="bg-white border-[4px] border-black p-8" style={hardShadowLg}>
              <h3 className="text-2xl font-black mb-3" style={hankenStack}>
                Unlimited operation
              </h3>
              <p className="text-neutral-600 leading-relaxed">
                Customers, vehicles, technicians, advisors, admins, and ordinary service records are
                not artificial upgrade triggers.
              </p>
            </div>
            <div className="bg-white border-[4px] border-black p-8" style={hardShadowLg}>
              <h3 className="text-2xl font-black mb-3" style={hankenStack}>
                Transparent hard costs
              </h3>
              <p className="text-neutral-600 leading-relaxed">
                When carriers, data providers, or payment networks create real usage costs, those
                costs can be passed through clearly or bundled into the product using them.
              </p>
            </div>
            <div className="bg-white border-[4px] border-black p-8" style={hardShadowLg}>
              <h3 className="text-2xl font-black mb-3" style={hankenStack}>
                Trigger moments, not walls
              </h3>
              <p className="text-neutral-600 leading-relaxed">
                An overdue invoice can offer automated collections. A vehicle due for service can
                offer re-engagement. The core workflow keeps moving either way.
              </p>
            </div>
          </div>
        </section>

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
            Create your workspace, configure your services and labor, add or import customers, and
            run your first live job without deciding whether basic shop operations are worth another
            monthly software bill.
          </p>
          <a href="/signup" className={neoBtn} style={{ backgroundColor: "#fff", ...hardShadow }}>
            Create your free workspace <span aria-hidden="true">→</span>
          </a>
        </section>
      </main>
      <ServerFooter />
    </div>
  );
}
