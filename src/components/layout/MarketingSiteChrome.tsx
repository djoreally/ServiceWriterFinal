import {
  MarketingNav,
  MarketingFooter as HomepageFooter,
  useMarketingFonts,
} from "@/components/marketing/MarketingLayout";
import { useAuth } from "@packages/auth";

export function MarketingSiteHeader() {
  useMarketingFonts();
  const { session } = useAuth();
  if (session) return null;
  return <MarketingNav />;
}

export function MarketingSiteFooter() {
  useMarketingFonts();
  return <HomepageFooter />;
}
