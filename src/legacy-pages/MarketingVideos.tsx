import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";

export default function MarketingVideos() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main>
        <section className="py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-6 text-center lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Videos</p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">
              Watch it work.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              Walkthroughs, onboarding guides, and feature demos — so you understand exactly what you&apos;re getting before you commit to anything.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Categories</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Getting Started</h3>
                <p className="mt-3 text-muted-foreground">
                  From signup to your first booking — in under 15 minutes. Watch the full onboarding walkthrough or jump to the part you need.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Feature Walkthroughs</h3>
                <p className="mt-3 text-muted-foreground">
                  Scheduling, dispatch, payments, fleet OS, the AI assistant — each explained on its own, at your pace.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Operator Stories</h3>
                <p className="mt-3 text-muted-foreground">
                  Real operators walking through how they use Service Writer in their specific context. Solo operator, three-van fleet,
                  fleet client operation — different workflows, same platform.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Setup Guides</h3>
                <p className="mt-3 text-muted-foreground">
                  Connecting Stripe or Square. Configuring your availability. Setting up automated texts. Short, specific, no fluff.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Start here</h2>
            <article className="mt-8 rounded-2xl border bg-card p-8">
              <h3 className="text-2xl font-black">Service Writer in 5 minutes</h3>
              <p className="mt-4 text-lg text-muted-foreground">
                The fastest way to understand what Service Writer does and whether it&apos;s right for your operation.
                No sign-up required to watch.
              </p>
            </article>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Most watched</h2>
            <ul className="mt-8 space-y-3 text-lg text-muted-foreground">
              <li>How to set up your booking page (8 min)</li>
              <li>Connecting Square to Service Writer (4 min)</li>
              <li>The dispatch board walkthrough (11 min)</li>
              <li>Setting up automated review requests (6 min)</li>
              <li>Fleet OS overview for multi-client operations (14 min)</li>
            </ul>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="rounded-2xl bg-primary/10 p-8 md:p-12">
              <h2 className="text-3xl font-black">Seen enough?</h2>
              <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
                Your booking page can be live today.
              </p>
              <Button asChild size="lg" className="mt-6">
                <Link to="/signup">Create your account →</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
