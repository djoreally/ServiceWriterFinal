import type { Metadata } from "next";
import { Suspense } from "react";
import { featurePageBySlug, featurePages } from "@/content/featurePages";
import { FeatureDetailClient } from "./FeatureDetailClient";

// generateMetadata/generateStaticParams are Next.js-required route-module
// exports, so this file legitimately exports non-components alongside the page.
/* eslint-disable react-refresh/only-export-components */

const SITE_URL = "https://servicewriter.xyz";

type PageProps = { params: Promise<{ featureSlug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { featureSlug } = await params;
  const feature = featurePageBySlug[featureSlug];
  if (!feature) return {};
  // Mirrors the meta tags the legacy page set client-side via useEffect,
  // now emitted server-side for SEO.
  const title = `${feature.name} | Service Writer Features`;
  const pageUrl = `${SITE_URL}/features/${feature.slug}`;
  const imageUrl = `${SITE_URL}${feature.heroImage}`;
  return {
    title,
    description: feature.summary,
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description: feature.summary,
      type: "website",
      url: pageUrl,
      images: [imageUrl],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: feature.summary,
      images: [imageUrl],
    },
  };
}

export function generateStaticParams() {
  return featurePages.map((feature) => ({ featureSlug: feature.slug }));
}

// Public marketing page (no auth guards — SPA parity). Unknown slugs render
// the legacy component, which <Navigate>s to /features-guide (SPA parity),
// so no notFound() here. Suspense satisfies Next's useSearchParams prerender
// rule for the adapter inside the client wrapper.
export default function FeatureDetailPage() {
  return (
    <Suspense fallback={null}>
      <FeatureDetailClient />
    </Suspense>
  );
}
