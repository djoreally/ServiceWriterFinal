import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";

export default function InsightsFeed() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main>
        <section className="py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Insights</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
              Operational intelligence for mobile service operators.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Dispatch strategy, fleet execution, financial discipline, and retention tactics — from the team building Service Writer and the operators using it.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">What you&apos;ll find here</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              This isn&apos;t a content marketing blog. It&apos;s a working library of operational knowledge for people running mobile service businesses.
            </p>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Dispatch and scheduling</h3>
                <p className="mt-3 text-muted-foreground">
                  How to build a schedule that doesn&apos;t fall apart when one job runs long. How to set buffer times.
                  How to handle same-day bookings without disrupting your week.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Fleet management</h3>
                <p className="mt-3 text-muted-foreground">
                  Managing multiple vans, multiple technicians, and multiple clients simultaneously.
                  What breaks down as you scale and how to fix it before it costs you.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Customer retention</h3>
                <p className="mt-3 text-muted-foreground">
                  The math on lifetime value. When to send a reminder. How to build a review strategy that doesn&apos;t feel desperate.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Financial operations</h3>
                <p className="mt-3 text-muted-foreground">
                  Revenue tracking, the difference between collected and billed revenue, how to read your dashboard and act on it.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6 md:col-span-2">
                <h3 className="text-xl font-bold">Technology and tools</h3>
                <p className="mt-3 text-muted-foreground">
                  How to get the most out of Service Writer. Feature deep-dives, setup guides, and configuration walkthroughs.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Featured insight</h2>
            <article className="mt-8 rounded-2xl border bg-card p-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Dispatch and scheduling</p>
              <h3 className="mt-3 text-2xl font-black">
                The dispatch mistake that costs mobile operators 3 hours a week
              </h3>
              <p className="mt-4 text-lg text-muted-foreground">
                Most mobile service businesses are losing time not because they&apos;re slow — but because their scheduling creates unnecessary gaps.
                Here&apos;s the calculation, and the fix.
              </p>
            </article>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="rounded-2xl bg-primary/10 p-8 md:p-12">
              <h2 className="text-3xl font-black">Stay current.</h2>
              <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
                New insights published every two weeks.
              </p>
              <Button asChild size="lg" className="mt-6">
                <Link to="/contact">Subscribe →</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
