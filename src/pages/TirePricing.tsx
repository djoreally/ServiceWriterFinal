import { AppLayout } from "@/components/layout/AppLayout";
import { TireServicePricingCard } from "@/components/catalog/TireServicePricingCard";

const TirePricing = () => {
  return (
    <AppLayout title="Tire Pricing">
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Tire &amp; Wheel Pricing</h1>
          <p className="text-sm text-muted-foreground">
            Installation, mount and balance, TPMS, disposal, and alignment pricing for your tire services.
          </p>
        </header>
        <TireServicePricingCard />
      </div>
    </AppLayout>
  );
};

export default TirePricing;
