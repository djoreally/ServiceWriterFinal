import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";
import { fetchPublicServiceCatalog } from "@/application/queries/public-booking.query";
import {
  fetchDirectoryProviderProfile,
  type DirectoryProviderProfile,
} from "@/application/queries/provider-directory.query";
import { attributionProps, captureAttribution } from "@/lib/attribution";
import { trackEvent } from "@/lib/posthog/analytics";
import { MARKETPLACE_EVENTS, trackMarketplaceEvent } from "@/lib/marketplaceTracking";
import { QuoteRequestDialog } from "@/components/pricing/QuoteRequestDialog";

type PublicService = {
  id: string;
  name: string;
  default_price: number;
  description: string | null;
};

const HERO_FALLBACK =
  "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=1600&q=80";

export default function ProviderProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<DirectoryProviderProfile | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [servicesError, setServicesError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteService, setQuoteService] = useState<string | null>(null);

  useEffect(() => {
    captureAttribution("provider_directory");
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!slug) {
        setError("Invalid provider link.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: profileError } = await fetchDirectoryProviderProfile(slug);
      if (profileError || !data) {
        setError("We couldn't find this provider profile.");
        setLoading(false);
        return;
      }

      setProfile(data);
      trackEvent("provider profile viewed", {
        organization_id: data.user_id,
        booking_slug: data.booking_slug,
        ...attributionProps(),
      });
      void trackMarketplaceEvent(MARKETPLACE_EVENTS.view, {
        providerUserId: data.user_id,
        bookingSlug: data.booking_slug,
      });

      const { data: serviceData, error: serviceError } = await fetchPublicServiceCatalog(data.user_id);
      setServicesError(Boolean(serviceError));
      setServices((serviceData || []) as PublicService[]);
      setLoading(false);
    };

    void load();
  }, [slug]);

  const startingPrice = useMemo(() => {
    const prices = services.map((s) => s.default_price).filter((price) => price > 0);
    return prices.length ? Math.min(...prices) : null;
  }, [services]);

  const bookingSlug = profile?.booking_slug || slug || "";

  const profileJsonLd = useMemo(() => {
    if (!profile) return null;
    return JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: profile.business_name,
      telephone: profile.phone || undefined,
      image: profile.logo_url || undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: profile.service_address || undefined,
        addressLocality: profile.city || undefined,
        addressRegion: profile.state || undefined,
        postalCode: profile.postal_code || undefined,
      },
      url: `/find-provider/${profile.booking_slug}`,
    });
  }, [profile]);

  const handleBookNowClick = () => {
    trackEvent("directory booking started", {
      organization_id: profile?.user_id,
      booking_slug: bookingSlug,
      ...attributionProps(),
    });
    void trackMarketplaceEvent(MARKETPLACE_EVENTS.bookingClick, {
      providerUserId: profile?.user_id,
      bookingSlug,
      dedupeKey: null,
    });
  };

  const openQuote = (serviceName?: string) => {
    setQuoteService(serviceName ?? null);
    setQuoteOpen(true);
    void trackMarketplaceEvent(MARKETPLACE_EVENTS.quoteClick, {
      providerUserId: profile?.user_id,
      bookingSlug,
      metadata: { service_name: serviceName ?? null },
      dedupeKey: null,
    });
  };




  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 pt-6 text-center">
            <p className="text-muted-foreground">{error || "Provider not found."}</p>
            <Button asChild>
              <Link to="/find-provider">Back to Find Provider</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <link rel="canonical" href={`/find-provider/${bookingSlug}`} />
      {profileJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: profileJsonLd }} />
      )}

      <main className="mx-auto max-w-3xl px-4 pb-12 md:px-6">
        {/* Hero image */}
        <div className="mt-4 h-48 w-full overflow-hidden rounded-xl bg-muted md:h-64">
          <img
            className="h-full w-full object-cover"
            src={profile.logo_url || HERO_FALLBACK}
            alt={profile.business_name}
          />
        </div>


        {/* Profile header */}
        <section className="mt-6 border-b border-border pb-6">
          <h1 className="text-2xl font-black text-foreground md:text-3xl">{profile.business_name}</h1>

          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground">Top-Rated</span>
            <span className="rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground">Verified</span>
            <span className="rounded-full border border-border px-3 py-0.5 text-xs font-bold text-muted-foreground">Fleet Ready</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold text-foreground">Active</span>
            </div>
            {profile.service_address && (
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                <span>{profile.service_address}</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span>Marketplace Verified</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock3 className="h-4 w-4 text-primary" />
              <span>Accepting Requests</span>
            </div>
          </div>
        </section>

        {/* CTA row */}
        <section className="flex flex-col gap-3 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-bold text-foreground">
              {startingPrice ? `Services from $${startingPrice}` : "Request pricing"}
            </p>
            <p className="text-xs text-muted-foreground">Fleet pricing available</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to={`/book/${bookingSlug}`} onClick={handleBookNowClick}>Book Now</Link>
            </Button>
            <Button variant="secondary" onClick={() => openQuote()}>
              Get a Quote
            </Button>

            {profile.phone && (
              <Button variant="outline" asChild>
                <a href={`tel:${profile.phone}`}>
                  <Phone className="mr-1 h-4 w-4" />
                  {profile.phone}
                </a>
              </Button>
            )}
          </div>
        </section>

        {/* About */}
        <section className="border-b border-border py-6">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-foreground">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            About
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {profile.business_name} is actively serving customers on Service Writer. Browse services below and request an appointment directly from this profile.
          </p>
        </section>

        {/* Services Offered */}
        <section className="border-b border-border py-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
            <Wrench className="h-5 w-5 text-primary" />
            Services Offered
          </h2>
          {services.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {services.map((service) => (
                <div key={service.id} className="flex items-start gap-2 rounded-md border border-border p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">{service.name}</p>
                    {service.default_price > 0 ? (
                      <p className="text-xs font-semibold text-primary">from ${service.default_price}</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openQuote(service.name)}
                        className="mt-1 text-xs font-bold text-primary hover:underline"
                      >
                        Get a quote
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {servicesError
                ? "We couldn't load this provider's services right now. Please refresh to try again."
                : "Services will appear here soon."}
            </p>
          )}

        </section>

        <QuoteRequestDialog
          open={quoteOpen}
          onOpenChange={setQuoteOpen}
          businessUserId={profile.user_id}
          businessName={profile.business_name}
          source="provider_directory"
          key={quoteService ?? "quote"}
        />

        {/* Back link */}
        <div className="pt-6">
          <Link
            to="/find-provider"
            className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to all providers
          </Link>
        </div>
      </main>

      <MarketingSiteFooter />
    </div>
  );
}
