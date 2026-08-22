import { Link, Navigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";
import { featurePageBySlug } from "@/content/featurePages";

const SITE_URL = "https://servicewriter.xyz";

export default function FeatureDetail() {
  const { featureSlug } = useParams<{ featureSlug: string }>();
  const feature = featureSlug ? featurePageBySlug[featureSlug] : undefined;

  useEffect(() => {
    if (!feature) return;

    const title = `${feature.name} | Service Writer Features`;
    const description = feature.summary;
    const pageUrl = `${SITE_URL}/features/${feature.slug}`;

    document.title = title;

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

    upsertMeta("description", description);
    upsertMeta("robots", "index,follow");
    upsertProperty("og:title", title);
    upsertProperty("og:description", description);
    upsertProperty("og:type", "website");
    upsertProperty("og:url", pageUrl);
    upsertProperty("og:image", `${SITE_URL}${feature.heroImage}`);
    upsertMeta("twitter:card", "summary_large_image");
    upsertMeta("twitter:title", title);
    upsertMeta("twitter:description", description);
    upsertMeta("twitter:image", `${SITE_URL}${feature.heroImage}`);
  }, [feature]);

  if (!feature) return <Navigate to="/features-guide" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-16 lg:py-20">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Feature Page</p>
        <h1 className="mt-4 text-4xl font-black sm:text-5xl">{feature.name}</h1>
        <p className="mt-5 text-lg text-muted-foreground">{feature.summary}</p>

        <img src={feature.heroImage} alt={`${feature.name} preview`} className="mt-8 w-full rounded-xl border" />

        <section className="mt-10 rounded-2xl border bg-card p-8">
          <h2 className="text-2xl font-black">What this feature helps you do</h2>
          <ul className="mt-5 list-disc space-y-3 pl-6 text-muted-foreground">
            {feature.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/signup">Start Free</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/features-guide">Back to Features Guide</Link>
            </Button>
          </div>
        </section>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
