import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";
import { featurePages } from "@/content/featurePages";
import { productShots } from "@/content/productShots";

export default function FeaturesGuide() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main>
        <section className="py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Product guide</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
              Everything you need to run your operation — and nothing you don&apos;t.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Service Writer is built around how mobile service actually works. Here&apos;s what&apos;s inside.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Individual feature pages</h2>
            <p className="mt-3 text-muted-foreground">
              Explore each feature on its own page with dedicated context and shareable links.
            </p>
            <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {featurePages.map((feature) => (
                <article key={feature.slug} className="rounded-2xl border bg-card p-6">
                  <div className="mb-4 rounded-lg border bg-primary/5 p-4 text-sm text-muted-foreground">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Workflow overview</p>
                    <p className="mt-2">{feature.highlights[0]}</p>
                  </div>
                  <h3 className="text-xl font-bold">{feature.name}</h3>
                  <p className="mt-3 text-muted-foreground">{feature.summary}</p>
                  <Button asChild variant="outline" className="mt-5">
                    <Link to={`/features/${feature.slug}`}>Feature details</Link>
                  </Button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Booking and scheduling</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Booking Page</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.servicePackages} alt="Booking Page screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Your booking page, live in minutes</h3>
                <p className="mt-3 text-muted-foreground">
                  Every account gets a branded booking page at your own URL. Customers pick their service, vehicle, date, and time.
                  They pay online or choose to pay at the appointment. You get a notification. The appointment lands on your calendar.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Availability Controls</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.servicePackages} alt="Availability Controls screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Availability you actually control</h3>
                <p className="mt-3 text-muted-foreground">
                  Set your hours, block dates, define lead times, and control how far out customers can book. Need buffer time between jobs?
                  We have that. Want to require approval before confirming? We have that too.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Subscription Services</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.subscriptions} alt="Subscription Services screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Subscription services</h3>
                <p className="mt-3 text-muted-foreground">
                  Offer your best customers recurring oil changes or maintenance packages. They subscribe once, you show up on schedule.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Dispatch and fleet</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Live Team Location</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.inventoryEmpty} alt="Live Team Location screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Know where your team is</h3>
                <p className="mt-3 text-muted-foreground">
                  Real-time technician locations on a map. See who&apos;s en route, who&apos;s on-site, and who&apos;s wrapping up.
                  Assign new jobs in seconds.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Ranked Assignment</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.inventoryOilUsage} alt="Ranked Assignment screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Ranked job assignment</h3>
                <p className="mt-3 text-muted-foreground">
                  The dispatch engine scores available technicians by distance, skills, current load, and ETA — and gives you a ranked list.
                  One click to assign. No guessing.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Fleet OS</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.inventoryItems} alt="Fleet OS screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Fleet OS</h3>
                <p className="mt-3 text-muted-foreground">
                  For businesses managing fleets on behalf of clients: full work order management, contract tracking, purchase orders,
                  client invoicing, and location check-in. A complete operation management suite inside Service Writer.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Payments</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Processor Flexibility</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.payments} alt="Processor Flexibility screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Stripe and Square — both fully supported</h3>
                <p className="mt-3 text-muted-foreground">
                  Connect whichever processor you already use. Switch anytime. We don&apos;t take a cut.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Payment Collection</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.payments} alt="Payment Collection screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Booking payments, invoices, and payment links</h3>
                <p className="mt-3 text-muted-foreground">
                  Collect payment at booking, send an invoice after, or text a payment link. All three work. All three land in your account.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Revenue Visibility</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.financials} alt="Revenue Visibility screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Real revenue tracking</h3>
                <p className="mt-3 text-muted-foreground">
                  Your dashboard shows collected revenue, outstanding balances, refunds, and trends — sourced from your actual payment records, not estimates.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Customer management</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Customer 360</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.vehicleSpecs} alt="Customer 360 screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Every customer, every vehicle, every visit</h3>
                <p className="mt-3 text-muted-foreground">
                  Full customer profiles with contact info, vehicle history, service records, lifetime value, and notes.
                  Everything you&apos;d want to know before showing up is already there.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Automation</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.financials} alt="Automation screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">Automated follow-ups</h3>
                <p className="mt-3 text-muted-foreground">
                  Review requests, service reminders, and follow-up messages go out automatically based on rules you set.
                  You write it once. It runs forever.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Two-way Messaging</p>
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/40">
                  <img src={productShots.vehicleSpecs} alt="Two-way Messaging screen in Service Writer" loading="lazy" className="aspect-video w-full object-cover object-top" />
                </div>
                <h3 className="text-xl font-bold">SMS and email, two-way</h3>
                <p className="mt-3 text-muted-foreground">
                  Customers can reply to texts. Their messages come into your inbox. You can respond from the platform.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">AI assistant</h2>
            <div className="mt-8 space-y-6">
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Operational Copilot</p>
                <h3 className="text-xl font-bold">An operational co-pilot, not a chatbot</h3>
                <p className="mt-3 text-muted-foreground">
                  The AI assistant knows your schedule, your customers, and your service history. Ask it what&apos;s on the books today.
                  Ask it to summarize a customer&apos;s history. Ask it to draft a follow-up message. It interprets, recommends, and prepares —
                  but never acts without your confirmation.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Voice + VIN Tools</p>
                <h3 className="text-xl font-bold">Voice, camera, and VIN</h3>
                <p className="mt-3 text-muted-foreground">
                  Dictate notes hands-free. Point your camera at a VIN to decode the vehicle instantly. The assistant works the way you work.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <h2 className="text-3xl font-black">Technician tools</h2>
            <div className="mt-8 space-y-6">
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Technician OS</p>
                <h3 className="text-xl font-bold">Technician OS</h3>
                <p className="mt-3 text-muted-foreground">
                  A dedicated interface for field technicians. Job details, checklists, inspection reports with photos, and shift management — optimized for mobile.
                </p>
              </article>
              <article className="rounded-2xl border bg-card p-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">HR Compliance</p>
                <h3 className="text-xl font-bold">HR and compliance</h3>
                <p className="mt-3 text-muted-foreground">
                  Skills records, document expiry tracking, leave requests, and appraisals. Everything you need to manage a field team without a separate HR system.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="rounded-2xl bg-primary/10 p-8 md:p-12">
              <h2 className="text-3xl font-black">See it in action.</h2>
              <p className="mt-4 max-w-3xl text-lg text-muted-foreground">
                The fastest way to understand what Service Writer can do is to run a test booking.
              </p>
              <Button asChild size="lg" className="mt-6">
                <Link to="/signup">Start your free account →</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
