import type { Metadata } from "next";
import { Suspense } from "react";
import { FeaturesGuideClient } from "./FeaturesGuideClient";

export const metadata: Metadata = {
  title: "Features Guide | Service Writer",
  description: "Explore every feature in Service Writer — booking, scheduling, vehicles, payments, and more — with dedicated feature pages and real product context.",
  robots: { index: true, follow: true },
};

// Public marketing page (no auth guards — SPA parity). The legacy component
// uses react-router <Link>, so it renders through NextRouterAdapter inside a
// client wrapper; Suspense satisfies Next's useSearchParams prerender rule.
export default function FeaturesGuidePage() {
  return (
    <Suspense fallback={null}>
      <FeaturesGuideClient />
    </Suspense>
  );
}
