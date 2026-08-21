import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Wrench, X } from "lucide-react";

const FONT_LINKS = [
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;700;800;900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
];

export const PRIMARY = "#596400";
export const PRIMARY_CONTAINER = "#e5ff00";
export const SURFACE = "#fbf9f8";
export const SURFACE_DIM = "#dbdad9";

export const neoBtn =
  "inline-flex items-center gap-2 border-[4px] border-black uppercase font-bold px-6 py-3 transition-all duration-75 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";
export const hardShadow = { boxShadow: "4px 4px 0px #000000" };
export const hardShadowLg = { boxShadow: "8px 8px 0px #000000" };
export const hankenStack = { fontFamily: "'Hanken Grotesk', sans-serif" };
export const interStack = { fontFamily: "'Inter', sans-serif" };
export const monoStack = { fontFamily: "'JetBrains Mono', monospace" };

export function useMarketingFonts() {
  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    FONT_LINKS.forEach((href) => {
      if (document.head.querySelector(`link[href="${href}"]`)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    });
    return () => {
      links.forEach((l) => l.remove());
    };
  }, []);
}

const NAV_LINKS = [
  { to: "/how-it-works", label: "How It Works" },
  { to: "/features-guide", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/find-provider", label: "Find Provider" },
  { to: "/faqs", label: "FAQs" },
  { to: "/contact", label: "Contact" },
];

const MOBILE_SECONDARY_LINKS = [
  { to: "/about", label: "About" },
  { to: "/blog", label: "Blog" },
  { to: "/insights", label: "Insights" },
  { to: "/partner-program", label: "Partner Program" },
  { to: "/white-glove-onboarding", label: "White Glove Onboarding" },
  { to: "/careers", label: "Careers" },
  { to: "/support", label: "Support" },
];

export function MarketingNav() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);
  const mobileLinks = [...NAV_LINKS, ...MOBILE_SECONDARY_LINKS];

  return (
    <nav
      className="w-full top-0 sticky z-50 border-b-[4px] border-black"
      style={{ backgroundColor: SURFACE }}
    >
      <div className="flex justify-between items-center h-20 px-6 max-w-[1200px] mx-auto">
        <Link to="/" className="flex items-center gap-3">
          <div
            className="w-10 h-10 border-[3px] border-black flex items-center justify-center"
            style={{ backgroundColor: PRIMARY_CONTAINER, boxShadow: "3px 3px 0px #000" }}
          >
            <Wrench className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-black uppercase tracking-tighter" style={hankenStack}>
            Service Writer
          </span>
        </Link>
        <div className="hidden lg:flex items-center gap-6">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.to);
            return (
              <Link
                key={link.to}
                to={link.to}
                className={active ? "font-bold border-b-[4px]" : "font-medium hover:opacity-70 transition"}
                style={active ? { borderColor: PRIMARY_CONTAINER } : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
        <div className="flex gap-4 items-center">
          <Link
            to="/login"
            className={neoBtn}
            style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow, fontSize: "0.875rem" }}
          >
            Login
          </Link>
          <button
            type="button"
            className="lg:hidden border-[3px] border-black bg-white p-2"
            style={hardShadow}
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="w-5 h-5" strokeWidth={3} /> : <Menu className="w-5 h-5" strokeWidth={3} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="lg:hidden border-t-[3px] border-black bg-white px-6 py-5">
          <div className="grid gap-3">
            {mobileLinks.map((link) => {
              const active = isActive(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-center justify-between border-[3px] border-black px-4 py-3 font-black uppercase tracking-wide"
                  style={{
                    backgroundColor: active ? PRIMARY_CONTAINER : SURFACE,
                    boxShadow: active ? "3px 3px 0px #000" : undefined,
                  }}
                >
                  {link.label}
                  {active && <span className="text-xs" style={monoStack}>Current</span>}
                </Link>
              );
            })}
          </div>
          <div className="mt-5">
            <Link
              to="/login"
              className="block border-[3px] border-black px-4 py-3 text-center font-black uppercase"
              style={{ backgroundColor: PRIMARY_CONTAINER }}
            >
              Login
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t-[4px] border-black bg-white">
      <div className="max-w-[1200px] mx-auto px-6 py-12 grid md:grid-cols-4 gap-8 text-sm">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 border-[3px] border-black flex items-center justify-center"
              style={{ backgroundColor: PRIMARY_CONTAINER }}
            >
              <Wrench className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <span className="font-black uppercase" style={hankenStack}>
              Service Writer
            </span>
          </div>
          <p style={{ color: "#5e5e5e" }}>
            Mobile-first operating system for independent shops, mobile mechanics, and fleet teams.
          </p>
        </div>
        <div>
          <div className="font-black uppercase mb-3" style={hankenStack}>Product</div>
          <ul className="space-y-2" style={{ color: "#5e5e5e" }}>
            <li><Link to="/how-it-works">How It Works</Link></li>
            <li><Link to="/features-guide">Features</Link></li>
            <li><Link to="/pricing">Pricing</Link></li>
            <li><Link to="/find-provider">Find Provider</Link></li>
            <li><Link to="/advertising-network">Advertising Network</Link></li>
            <li><Link to="/faqs">FAQs</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-black uppercase mb-3" style={hankenStack}>Company</div>
          <ul className="space-y-2" style={{ color: "#5e5e5e" }}>
            <li><Link to="/about">About</Link></li>
            <li><Link to="/partner-program">Partner Program</Link></li>
            <li><Link to="/white-glove-onboarding">White Glove Onboarding</Link></li>
            <li><Link to="/blog">Blog</Link></li>
            <li><Link to="/insights">Insights</Link></li>
            <li><Link to="/careers">Careers</Link></li>
            <li><Link to="/contact">Contact</Link></li>
            <li><Link to="/support">Support</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-black uppercase mb-3" style={hankenStack}>Legal</div>
          <ul className="space-y-2" style={{ color: "#5e5e5e" }}>
            <li><Link to="/privacy-policy">Privacy</Link></li>
            <li><Link to="/terms">Terms</Link></li>
            <li><Link to="/security">Security</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t-2 border-black/10 max-w-[1200px] mx-auto px-6 py-4 text-xs" style={{ color: "#5e5e5e" }}>
        © {new Date().getFullYear()} Service Writer
      </div>
    </footer>
  );
}

export function MarketingLayout({ children }: { children: ReactNode }) {
  useMarketingFonts();
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
      <MarketingNav />
      <main className="flex-1 max-w-[1200px] mx-auto px-6 py-16 w-full">{children}</main>
      <MarketingFooter />
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <header className="mb-16 text-center">
      {eyebrow && (
        <div className="inline-block border-[3px] border-black bg-white px-5 py-1.5 mb-6" style={hardShadow}>
          <span className="uppercase text-xs tracking-widest" style={{ ...monoStack, color: PRIMARY }}>
            {eyebrow}
          </span>
        </div>
      )}
      <h1
        className="font-black max-w-4xl mx-auto"
        style={{ ...hankenStack, fontSize: "clamp(36px, 6vw, 64px)", lineHeight: 1.05, letterSpacing: "-0.04em" }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-xl max-w-2xl mx-auto mt-6" style={{ color: "#5e5e5e", lineHeight: 1.6 }}>
          {subtitle}
        </p>
      )}
    </header>
  );
}

export function NeoCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border-[4px] border-black p-8 ${className}`} style={hardShadowLg}>
      {children}
    </div>
  );
}
