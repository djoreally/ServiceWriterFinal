import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";

export default function TechnicalArticle() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main>
        <section className="py-20 lg:py-28">
          <div className="mx-auto max-w-5xl px-6 lg:px-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Technical Deep-Dive</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
              Inside the Technician OS: how leading operators use Service Writer to scale on-site execution
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              A detailed look at how multi-van operations use dispatch scoring, real-time tracking, and automated follow-up to reduce missed ETAs, improve first-time fix rates, and grow without adding headcount.
            </p>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-4xl space-y-12 px-6 lg:px-8">
            <article>
              <h2 className="text-3xl font-black">The scaling problem</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Adding a second or third van to a mobile service operation doesn&apos;t just double your capacity — it multiplies your coordination overhead.
                One technician, one schedule. Three technicians, three schedules, three locations, and a communication gap that grows every time a job runs long.
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                The operators who scale successfully aren&apos;t working harder. They&apos;re systematizing the decisions they used to make manually.
              </p>
            </article>

            <article>
              <h2 className="text-3xl font-black">Dispatch scoring in practice</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Service Writer&apos;s dispatch engine scores every available technician against every incoming job across four dimensions:
                distance to job, current workload, relevant skills, and estimated time to arrival.
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                A technician finishing a job two miles away scores higher than one starting fresh from home base six miles out.
                A technician certified for synthetic oil changes scores higher for a premium vehicle than one without that flag.
                The engine doesn&apos;t pick the technician — it gives the dispatcher a ranked list with the reasoning visible.
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                In practice, operators report that 80–90% of assignments come from the top-ranked suggestion.
                The engine isn&apos;t replacing judgment — it&apos;s accelerating it.
              </p>
            </article>

            <article>
              <h2 className="text-3xl font-black">The ETA problem</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Missed ETAs are the most common source of customer complaints in mobile service. The cause is almost always the same:
                the previous job ran long, and no one communicated.
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                Service Writer addresses this at two levels. The technician app sends real-time location updates that customers can see.
                The scheduler surfaces time conflicts before they happen, not after. When a job is running more than 15 minutes over estimate,
                the platform flags the next appointment for review.
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                Operators using these features report a significant reduction in &ldquo;where&apos;s my technician&rdquo; calls.
              </p>
            </article>

            <article>
              <h2 className="text-3xl font-black">First-time fix rates</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                A first-time fix failure in mobile service usually means one of three things: wrong parts on the van, wrong information about the vehicle,
                or an unexpected vehicle condition that wasn&apos;t flagged at booking.
              </p>
              <p className="mt-4 text-lg text-muted-foreground"><span className="font-bold text-foreground">Service Writer addresses all three:</span></p>
              <ul className="mt-3 space-y-3 text-muted-foreground">
                <li><span className="font-bold text-foreground">Parts and inventory</span> — The service catalog is connected to inventory. When a job is booked, the platform can flag if required parts are below par stock. Technicians see the parts list for each job before they leave.</li>
                <li><span className="font-bold text-foreground">Vehicle information</span> — VIN decode happens at booking, not at the vehicle. Technicians arrive knowing the year, make, model, engine, oil specification, and service history.</li>
                <li><span className="font-bold text-foreground">Vehicle condition</span> — The inspection checklist and photo capture tools let technicians document conditions at the start of a job. Unexpected findings are logged, not forgotten.</li>
              </ul>
            </article>

            <article>
              <h2 className="text-3xl font-black">Retention without effort</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Most mobile service operators know they should follow up with customers. Few do it consistently because it competes with the operational demands of running the business.
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                Service Writer&apos;s automated follow-up system runs independently of operator attention. After a service, a review request goes out on a configurable delay.
                After a set interval — typically 90 days for oil changes — a service reminder goes out. The timing, message, and channel (email or SMS) are configured once and run continuously.
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                Operators who have this configured consistently outperform their own benchmarks on repeat booking rates without changing anything about their customer interactions.
              </p>
            </article>

            <article>
              <h2 className="text-3xl font-black">What this requires</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                These capabilities don&apos;t configure themselves. The operators getting the most from Service Writer have done the upfront work:
                building out their service catalog accurately, configuring their scheduling rules, and connecting their payment processor before going live.
              </p>
              <p className="mt-4 text-lg text-muted-foreground">
                That&apos;s a few hours of setup. The return on that investment runs for years.
              </p>
            </article>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-6xl px-6 lg:px-8">
            <div className="rounded-2xl bg-primary/10 p-8 md:p-12">
              <h2 className="text-3xl font-black">Ready to build this operation?</h2>
              <Button asChild size="lg" className="mt-6">
                <Link to="/signup">Start your account →</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
