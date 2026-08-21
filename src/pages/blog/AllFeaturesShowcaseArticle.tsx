import { useEffect } from "react";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";

const SITE_URL = "https://servicewriter.xyz";
const ARTICLE_PATH = "/blog/all-features-showcase";
const ARTICLE_URL = `${SITE_URL}${ARTICLE_PATH}`;
const OG_IMAGE = `${SITE_URL}/hero/command-center.svg`;

const upsertMetaProperty = (property: string, content: string) => {
  let node = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("property", property);
    document.head.appendChild(node);
  }
  node.content = content;
};

const upsertMetaName = (name: string, content: string) => {
  let node = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute("name", name);
    document.head.appendChild(node);
  }
  node.content = content;
};

export default function AllFeaturesShowcaseArticle() {
  useEffect(() => {
    const title = "The Complete Service Writer Feature Showcase for Mobile Auto Service Teams";
    const description =
      "A full walkthrough of Service Writer features across scheduling, dispatch, payments, CRM, fleet, marketing, retention, reporting, and team operations.";

    document.title = title;
    upsertMetaName("description", description);
    upsertMetaName("robots", "index,follow");
    upsertMetaProperty("og:title", title);
    upsertMetaProperty("og:description", description);
    upsertMetaProperty("og:type", "article");
    upsertMetaProperty("og:url", ARTICLE_URL);
    upsertMetaProperty("og:image", OG_IMAGE);
    upsertMetaName("twitter:card", "summary_large_image");
    upsertMetaName("twitter:title", title);
    upsertMetaName("twitter:description", description);
    upsertMetaName("twitter:image", OG_IMAGE);

    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.href = ARTICLE_URL;

    const schemaId = "blog-article-schema";
    let schema = document.getElementById(schemaId) as HTMLScriptElement | null;
    if (!schema) {
      schema = document.createElement("script");
      schema.id = schemaId;
      schema.type = "application/ld+json";
      document.head.appendChild(schema);
    }
    schema.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: title,
      description,
      image: [OG_IMAGE],
      datePublished: "2026-04-05",
      dateModified: "2026-04-05",
      mainEntityOfPage: ARTICLE_URL,
      author: {
        "@type": "Organization",
        name: "Service Writer",
      },
      publisher: {
        "@type": "Organization",
        name: "Service Writer",
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/logo.png`,
        },
      },
    });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16 lg:py-20">
        <article className="prose prose-neutral max-w-none dark:prose-invert">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Feature Showcase</p>
          <h1>The Complete Service Writer Feature Showcase for Mobile Auto Service Teams</h1>
          <p className="lead">
            Running a mobile service business means balancing ten jobs at once: booking, dispatching, customer updates,
            payments, technician workload, and end-of-day reporting. Service Writer was built to bring those moving parts
            into one operational system so owners can scale without creating chaos. This article walks through the full
            feature set and shows how each module connects to real day-to-day work in the field.
          </p>

          <img
            src="/hero/command-center.svg"
            alt="Service Writer command center dashboard preview"
            className="w-full rounded-xl border"
          />

          <h2>1) Scheduling and booking that matches real-world operations</h2>
          <p>
            Service Writer starts where revenue starts: booked work. Teams can manage appointment intake with customer,
            vehicle, and service context in one flow, then align the schedule with technician and van availability. For
            businesses handling mixed work types—residential, fleet, and urgent service calls—the platform keeps timing,
            assignment, and status updates visible from one command center. Instead of text-thread scheduling and whiteboard
            planning, dispatch decisions happen with live operational context.
          </p>

          <h2>2) Dispatch, technician workflow, and field execution</h2>
          <p>
            Dispatch and technician tools are tightly linked so there is no handoff gap between office planning and field
            execution. Teams can assign technicians, map jobs, and monitor progress while technicians use the mobile-first
            workflows to move jobs from scheduled to in-progress to complete. This reduces missed updates, duplicated calls,
            and uncertainty around ETA windows. When service volume increases, that operational visibility becomes the
            difference between scalable growth and daily firefighting.
          </p>

          <h2>3) Customer records, vehicle history, and service consistency</h2>
          <p>
            Customer and vehicle profiles centralize maintenance history, notes, and service context so each visit starts
            informed. Teams avoid repeating intake questions and can deliver consistent recommendations based on known
            history. For businesses focused on retention, this matters because trust is built through continuity: customers
            feel remembered, and technicians can work faster with better context. Across repeat appointments, the system
            turns raw transactions into long-term relationship data.
          </p>

          <h2>4) Financial operations from quote to payment</h2>
          <p>
            Service Writer connects quoting, completed work, and payment workflows so revenue tracking is not delayed until
            after the fact. Teams can move from service execution to payment capture while maintaining clear transaction
            records for reporting and follow-up. The result is stronger cash flow discipline and less reconciliation effort
            at the end of the week. Owners get clearer insight into which services drive margin and where operational
            bottlenecks are affecting profitability.
          </p>

          <h2>5) Fleet support and multi-vehicle account management</h2>
          <p>
            For operators serving fleet clients, Service Writer includes fleet-oriented records and work-order management
            that support recurring service relationships. Teams can organize client entities, vehicles, and service history
            in a structure designed for account-level visibility, not just single-customer workflows. This allows providers
            to run consumer and commercial service lines in one system while maintaining process clarity.
          </p>

          <h2>6) Growth tools: campaigns, reviews, and Google Business Profile readiness</h2>
          <p>
            Growth depends on consistent follow-up, not one-off promotions. Service Writer’s growth tools bring together
            campaigns, review workflows, testimonials, analytics, and now a dedicated Google My Business workspace tab.
            That means operators can coordinate visibility efforts and service delivery from one platform instead of
            juggling disconnected tools. Reviews and local search credibility are no longer an afterthought—they become part
            of the operating rhythm.
          </p>

          <h2>7) Reporting, retention insights, and decision support</h2>
          <p>
            As teams grow, decisions need better signals than intuition. Reporting and retention modules surface trends
            around service activity, repeat behavior, and revenue movement so teams can prioritize the right opportunities.
            Whether the goal is increasing repeat visits, improving route utilization, or expanding fleet contracts, the
            platform provides a shared data layer for managers and owners.
          </p>

          <h2>Why this matters for scaling mobile service teams</h2>
          <p>
            Most service businesses do not fail because they lack demand; they fail because operations cannot keep pace with
            demand. Service Writer is designed to close that gap by connecting booking, dispatch, service execution,
            payments, growth, and reporting into one practical system. The outcome is less operational drag, faster team
            coordination, and a clearer path from daily activity to durable, repeatable growth.
          </p>
        </article>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
