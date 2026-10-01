import { useEffect } from "react";

/**
 * Shared SEO sync effect, extracted verbatim from the `SeoManager` in
 * `src/App.tsx`.
 *
 * The SPA shell feeds it `useLocation().pathname` (react-router); the
 * App Router shell (`NextSeoManager`) feeds it `usePathname()`. Both exclude
 * the query string, so behavior is identical in both hosts.
 */
export function useSeoSync(pathname: string): void {
  useEffect(() => {
    const seoByPath: Record<string, { title: string; description: string }> = {
      "/": { title: "Service Writer | Mobile Mechanic Platform", description: "Service Writer helps mobile mechanics streamline booking, dispatch, diagnostics, and payment workflows." },
      "/pricing": { title: "Pricing | Service Writer", description: "Start free with Service Writer, then upgrade as your team grows with plans for solo mechanics, shops, and fleets." },
      "/about": { title: "About Us | Service Writer", description: "Learn how Service Writer was built by mechanics for mechanics." },
      "/blog": { title: "Blog | Service Writer", description: "Guides, product updates, and growth playbooks for mobile service teams." },
      "/how-it-works": { title: "How It Works | Service Writer", description: "See how Service Writer connects booking, dispatch, field service, payments, and customer follow-up in one mobile-first workflow." },
      "/faqs": { title: "FAQs | Service Writer", description: "Answers to common questions about Service Writer features, offline use, payments, messaging, booking, and data security." },
      "/careers": { title: "Careers | Service Writer", description: "Learn about the team building Service Writer and the roles we expect to hire for as we grow." },
      "/find-provider": { title: "Find a Service Provider | Service Writer", description: "Find mobile mechanics, independent shops, and fleet service teams using Service Writer public booking pages." },
      "/blog/all-features-showcase": { title: "The Complete Service Writer Feature Showcase for Mobile Auto Service Teams", description: "A full walkthrough of Service Writer features across scheduling, dispatch, payments, CRM, fleet, marketing, retention, reporting, and team operations." },
      "/contact": { title: "Contact Us | Service Writer", description: "Get sales help, onboarding guidance, partnership answers, and technical support from the Service Writer team." },
      "/fair-price": { title: "Auto Repair Fair-Price Calculator | Service Writer", description: "Audit vehicle repairs pricing instantly with our fair-market parts and labor cost estimator tool." },
      "/privacy-policy": { title: "Privacy Policy | Service Writer", description: "Read how Service Writer handles, protects, and governs personal and operational data." },
      "/terms": { title: "Terms of Service | Service Writer", description: "Review the terms governing use of Service Writer products and services." },
      "/security": { title: "Security | Service Writer", description: "Understand Service Writer security controls, safeguards, and vulnerability disclosure channels." },
      "/partner-program": { title: "Partner Program | Service Writer", description: "Join the Service Writer partner network for fleets, integrations, and reseller growth." },
      "/advertising-network": { title: "Collective Advertising Network | Service Writer", description: "Join the collective advertising network built for independent automotive service providers." },
      "/white-glove-onboarding": { title: "White Glove Onboarding | Service Writer", description: "Accelerate go-live with white glove onboarding, migration, and team enablement." },
      "/insights": { title: "Insights | Service Writer", description: "Technical insights, fleet strategy, and operational playbooks for modern service teams." },
      "/insights/technical-article": { title: "Technical Article | Service Writer", description: "Deep-dive technical guidance for fleet maintenance, diagnostics, and dispatch optimization." },
      "/support": { title: "Support | Service Writer", description: "Get help with Service Writer setup, troubleshooting, billing, booking pages, messaging, payments, and day-to-day workflows." },
      "/features-guide": { title: "Features Guide | Service Writer", description: "Explore Service Writer features for booking, dispatch, payments, customer management, fleet operations, marketing, and reporting." },
    };

    const SITE_URL = "https://servicewriter.xyz";

    const upsertMeta = (name: string, content: string) => {
      let node = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!node) {
        node = document.createElement("meta");
        node.name = name;
        document.head.appendChild(node);
      }
      node.content = content;
    };

    const upsertProperty = (property: string, content: string) => {
      let node = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!node) {
        node = document.createElement("meta");
        node.setAttribute("property", property);
        document.head.appendChild(node);
      }
      node.content = content;
    };

    const setCanonical = (href: string) => {
      let node = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!node) {
        node = document.createElement("link");
        node.rel = "canonical";
        document.head.appendChild(node);
      }
      node.href = href;
    };

    const dynamicPublicSeo =
      pathname.startsWith("/find-provider/") ||
      pathname.startsWith("/public-services/") ||
      pathname.startsWith("/subscribe/") ||
      pathname.startsWith("/book/");
    const marketingSeo = seoByPath[pathname];
    const isFeatureDetailPath = pathname.startsWith("/features/");
    const isIndexable = Boolean(marketingSeo) || isFeatureDetailPath || dynamicPublicSeo;
    const pageUrl = `${SITE_URL}${pathname === "/" ? "/" : pathname.replace(/\/+$/, "")}`;

    if (marketingSeo) {
      document.title = marketingSeo.title;
      upsertMeta("description", marketingSeo.description);
      upsertProperty("og:title", marketingSeo.title);
      upsertProperty("og:description", marketingSeo.description);
      upsertMeta("twitter:title", marketingSeo.title);
      upsertMeta("twitter:description", marketingSeo.description);
    }

    if (isIndexable) {
      upsertMeta("robots", "index,follow");
      // Canonical and og:url always self-reference the current route.
      setCanonical(pageUrl);
      upsertProperty("og:url", pageUrl);
      upsertProperty("og:image", `${SITE_URL}/og-image.png`);
      upsertMeta("twitter:url", pageUrl);
      upsertMeta("twitter:image", `${SITE_URL}/og-image.png`);
    } else {
      upsertMeta("robots", "noindex,nofollow");
    }
  }, [pathname]);
}
