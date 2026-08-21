import { AppLayout } from "@/components/layout/AppLayout";
import { NewsletterSequence } from "@/components/marketing/NewsletterSequence";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";

const Newsletter = () => {
  return (
    <div className="min-h-screen bg-background">
      <MarketingSiteHeader />
      <AppLayout title="Newsletter Sequences">
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold mb-2">Newsletter Sequences</h2>
            <p className="text-muted-foreground">
              Manage automated monthly newsletter campaigns with seasonal and holiday themes
            </p>
          </div>
          
          <NewsletterSequence />
        </div>
      </AppLayout>
      <MarketingSiteFooter />
    </div>
  );
};

export default Newsletter;
