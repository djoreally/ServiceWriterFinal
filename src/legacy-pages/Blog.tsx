import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  MarketingLayout,
  PageHeader,
  NeoCard,
  neoBtn,
  hardShadow,
  hankenStack,
  monoStack,
  PRIMARY,
  PRIMARY_CONTAINER,
} from "@/components/marketing/MarketingLayout";

const CATEGORIES = [
  { title: "Product Updates", body: "What's new in Service Writer. Features, fixes, and what's coming." },
  { title: "Operator Playbooks", body: "How real mobile service businesses run dispatching, pricing, retention, and hiring." },
  { title: "Business Fundamentals", body: "Revenue tracking, customer acquisition, fleet management basics." },
  { title: "Industry", body: "Market trends, technology shifts, and where mobile auto service is going." },
];

const BLOG_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Service Writer Blog",
  description:
    "Product updates, operator stories, and operational guidance from the people building and using Service Writer.",
  url: "https://servicewriter.xyz/blog",
  about: CATEGORIES.map((category) => ({
    "@type": "Thing",
    name: category.title,
    description: category.body,
  })),
  mainEntity: {
    "@type": "ItemList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        url: "https://servicewriter.xyz/blog/all-features-showcase",
        name: "The Complete Service Writer Feature Showcase for Mobile Auto Service Teams",
      },
    ],
  },
};

export default function Blog() {
  return (
    <MarketingLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_SCHEMA) }} />
      <PageHeader
        eyebrow="Blog"
        title="From the field, for the field."
        subtitle="Product updates, operator stories, and operational guidance from the people building and using Service Writer."
      />

      <section className="mb-16">
        <div className="flex items-center gap-6 mb-8">
          <h2 className="uppercase tracking-widest text-white px-6 py-2 text-2xl font-black" style={{ ...hankenStack, backgroundColor: "#000" }}>
            Categories
          </h2>
          <div className="h-[4px] flex-grow bg-black" />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {CATEGORIES.map((c) => (
            <NeoCard key={c.title}>
              <h3 className="text-xl font-black mb-2" style={hankenStack}>{c.title}</h3>
              <p style={{ color: "#3a3a3a" }}>{c.body}</p>
            </NeoCard>
          ))}
        </div>
      </section>

      <section className="mb-16">
        <div className="flex items-center gap-6 mb-8">
          <h2 className="uppercase tracking-widest text-white px-6 py-2 text-2xl font-black" style={{ ...hankenStack, backgroundColor: "#000" }}>
            Featured
          </h2>
          <div className="h-[4px] flex-grow bg-black" />
        </div>
        <NeoCard>
          <div className="text-xs uppercase tracking-widest mb-3" style={{ ...monoStack, color: PRIMARY }}>
            Operator Playbooks
          </div>
          <h3 className="text-3xl font-black mb-4" style={hankenStack}>
            The Complete Service Writer Feature Showcase for Mobile Auto Service Teams
          </h3>
          <p className="text-lg mb-6" style={{ color: "#3a3a3a" }}>
            A full breakdown of every major Service Writer feature — booking, dispatch, fleet, payments, growth tools, and reporting.
          </p>
          <Link to="/blog/all-features-showcase" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>
            Read article <ArrowRight className="w-4 h-4" />
          </Link>
        </NeoCard>
      </section>

      <NeoCard className="text-center">
        <h2 className="text-3xl font-black mb-3" style={hankenStack}>
          Want product updates?
        </h2>
        <p className="mb-6 max-w-2xl mx-auto" style={{ color: "#3a3a3a" }}>
          We do not have an in-app newsletter signup on this page yet. Contact us and we'll send product updates directly.
        </p>
        <Link to="/contact" className={neoBtn} style={{ backgroundColor: PRIMARY_CONTAINER, ...hardShadow }}>
          Contact us about updates
        </Link>
      </NeoCard>
    </MarketingLayout>
  );
}
