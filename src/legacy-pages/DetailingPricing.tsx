import { AppLayout } from "@/components/layout/AppLayout";
import { DetailingPricingRulesCard } from "@/components/catalog/DetailingPricingRulesCard";

const DetailingPricing = () => {
  return (
    <AppLayout title="Detailing Pricing">
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Detailing &amp; Car Wash Pricing</h1>
          <p className="text-sm text-muted-foreground">
            Vehicle-size and condition rules that adjust price, duration, and provider review requirements.
          </p>
        </header>
        <DetailingPricingRulesCard />
      </div>
    </AppLayout>
  );
};

export default DetailingPricing;
