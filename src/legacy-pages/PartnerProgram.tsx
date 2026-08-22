import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";

export default function PartnerProgram() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main>
        <section className="py-24 lg:py-32">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Partner Program</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
              Grow with Service Writer
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Join our partner network and help mobile service businesses modernize their operations.
            </p>
          </div>
        </section>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
