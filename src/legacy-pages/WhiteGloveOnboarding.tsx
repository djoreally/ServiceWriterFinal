import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";

export default function WhiteGloveOnboarding() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main>
        <section className="py-20 lg:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-2 lg:px-8">
            <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">White-Glove Onboarding</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
              We set up everything. You start operating.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Our team configures your entire Service Writer account — services, pricing, scheduling, payments, branding, and automations — so you&apos;re ready to take your first booking before you finish your first cup of coffee.
            </p>
            </div>
            <img
              src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1400&q=80"
              alt="Onboarding specialist configuring business operations software"
              className="h-full min-h-[320px] w-full rounded-2xl object-cover shadow-xl"
            />
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">What we handle for you</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Service catalog</h3>
                <p className="mt-3 text-muted-foreground">
                  We configure your full list of services with pricing, duration estimates, oil type options, and add-ons.
                  Based on what you tell us, not a template you have to edit yourself.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Scheduling and availability</h3>
                <p className="mt-3 text-muted-foreground">
                  We set your hours, buffer times, booking windows, and appointment rules. Customers see exactly when you&apos;re available — nothing more, nothing less.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Payment processing</h3>
                <p className="mt-3 text-muted-foreground">
                  We walk you through connecting Stripe or Square. We configure your pricing tiers, surcharges, waste oil fees, and any add-ons.
                  Your first payment is ready to process on day one.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Booking page and branding</h3>
                <p className="mt-3 text-muted-foreground">
                  Your logo. Your colors. Your booking link. We build it and test it so your first customer sees a professional experience.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Automated communications</h3>
                <p className="mt-3 text-muted-foreground">
                  Booking confirmations, reminder texts, follow-up emails, and review requests — we configure all of it with your business name and voice.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <h3 className="text-xl font-bold">Team setup</h3>
                <p className="mt-3 text-muted-foreground">
                  If you have technicians or managers, we set up their accounts and permissions. No one touches what they&apos;re not supposed to.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">The sprint</h2>
            <p className="mt-4 text-lg text-muted-foreground">White-glove onboarding runs over two working days.</p>
            <div className="mt-6 space-y-4 text-muted-foreground">
              <p><span className="font-bold text-foreground">Day 1:</span> Kickoff call. We gather everything we need — your service list, pricing, logo, scheduling rules, payment processor credentials.</p>
              <p><span className="font-bold text-foreground">Day 2:</span> We build. By end of day, your account is configured and we walk you through a live test booking.</p>
              <p><span className="font-bold text-foreground">Day 3 and beyond:</span> You operate. We&apos;re reachable if anything needs adjustment.</p>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Who it&apos;s for</h2>
            <p className="mt-4 text-lg text-muted-foreground">White-glove onboarding is right for you if:</p>
            <ul className="mt-6 space-y-3 text-muted-foreground">
              <li>You&apos;re switching from another system and want zero downtime</li>
              <li>You&apos;re launching a new operation and want to start clean</li>
              <li>You&apos;ve tried DIY setup and want someone else to just do it</li>
              <li>You&apos;re managing multiple vans and need everything configured correctly from the start</li>
            </ul>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Pricing</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              White-glove onboarding is included in the Elite VIP plan. It&apos;s available as a paid add-on for Performance plan subscribers.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="rounded-2xl bg-primary/10 p-8 md:p-12">
              <h2 className="text-3xl font-black">Ready to hand it off?</h2>
              <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
                Book a kickoff call and we&apos;ll take it from there.
              </p>
              <Button asChild size="lg" className="mt-6">
                <Link to="/contact">Book your onboarding →</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
