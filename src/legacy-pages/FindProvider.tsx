import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Search } from "lucide-react";
import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";
import { ListPagination } from "@/components/ui/list-pagination";
import {
  fetchProviderDirectoryServices,
  searchProviderDirectory,
  type ProviderServiceItem,
} from "@/application/queries/provider-directory.query";
import { attributionProps, captureAttribution } from "@/lib/attribution";
import { trackEvent } from "@/lib/posthog/analytics";
import { MARKETPLACE_EVENTS, trackMarketplaceEvent } from "@/lib/marketplaceTracking";
import { serializeJsonLd } from "@/lib/jsonLd";

type ProviderCard = {
  userId: string;
  businessName: string;
  slug: string;
  image: string | null;
  serviceAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  services: string[];
  startingPrice: number | null;
};

const DEFAULT_IMAGES = [
  "https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=400&q=80",
  "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=400&q=80",
];

const PAGE_SIZE = 25;

export default function FindProvider() {
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const searchedOnceRef = useRef(false);

  useEffect(() => {
    captureAttribution("provider_directory");
  }, []);

  const fetchProviders = useCallback(async (query: string, targetPage: number) => {
    setLoading(true);
    setError(null);

    const { data: rpcResults, totalCount: total, error: rpcError } = await searchProviderDirectory(query, {
      limit: PAGE_SIZE,
      offset: (targetPage - 1) * PAGE_SIZE,
    });

    if (rpcError) {
      setError("We couldn't load providers right now. Please try again.");
      setProviders([]);
      setTotalCount(0);
      setLoading(false);
      return;
    }

    setTotalCount(total);

    if (!rpcResults.length) {
      setProviders([]);
      setLoading(false);
      return;
    }

    const providerIds = rpcResults.map((r) => r.user_id);
    const { data: serviceRows } = await fetchProviderDirectoryServices(providerIds);

    const servicesByUser = new Map<string, ProviderServiceItem[]>();
    (serviceRows || []).forEach((svc) => {
      const list = servicesByUser.get(svc.user_id) || [];
      list.push(svc);
      servicesByUser.set(svc.user_id, list);
    });

    const cards: ProviderCard[] = rpcResults.map((provider) => {
      const svcList = servicesByUser.get(provider.user_id) || [];
      const prices = svcList.map((s) => s.default_price || 0).filter((p) => p > 0);
      return {
        userId: provider.user_id,
        businessName: provider.business_name,
        slug: provider.booking_slug || "",
        image: provider.logo_url,
        serviceAddress: provider.service_address,
        city: provider.city,
        state: provider.state,
        postalCode: provider.postal_code,
        services: svcList.map((s) => s.name).slice(0, 3),
        startingPrice: prices.length ? Math.min(...prices) : null,
      };
    });

    setProviders(cards);
    setLoading(false);

    // Directory impressions — one per provider per session.
    cards.forEach((card) => {
      void trackMarketplaceEvent(MARKETPLACE_EVENTS.impression, {
        providerUserId: card.userId,
        bookingSlug: card.slug,
        metadata: { query_length: query.length },
      });
    });
  }, []);

  useEffect(() => {
    if (!hasSearched) {
      setLoading(false);
      setProviders([]);
      setTotalCount(0);
      return;
    }

    void fetchProviders(appliedQuery, page);
  }, [fetchProviders, appliedQuery, hasSearched, page]);

  useEffect(() => {
    if (loading) return;
    if (!hasSearched || (!searchedOnceRef.current && !appliedQuery)) return;
    trackEvent("directory searched", {
      query_length: appliedQuery.length,
      result_count: totalCount,
      page,
      ...attributionProps(),
    });
  }, [appliedQuery, hasSearched, page, totalCount, loading]);

  const handleSearch = () => {
    const query = locationInput.trim();
    if (!query) {
      setHasSearched(false);
      setProviders([]);
      setTotalCount(0);
      setError("Enter a city, state, or ZIP code to search the directory.");
      return;
    }

    searchedOnceRef.current = true;
    setError(null);
    setHasSearched(true);
    setPage(1);
    setAppliedQuery(query);
  };

  const clearSearch = () => {
    setLocationInput("");
    setAppliedQuery("");
    setHasSearched(false);
    setError(null);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const formatLocation = (p: ProviderCard) => {
    const parts = [p.city, p.state].filter(Boolean);
    if (p.postalCode) parts.push(p.postalCode);
    return parts.join(", ") || p.serviceAddress || "Location not provided";
  };

  const listJsonLd = useMemo(
    () =>
      ({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Mobile oil change and mechanic providers",
        numberOfItems: providers.length,
        itemListElement: providers.map((provider, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `/find-provider/${provider.slug}`,
          name: provider.businessName,
        })),
      }),
    [providers]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <link rel="canonical" href="/find-provider" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(listJsonLd) }} />

      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        {/* Hero */}
        <section className="mb-8">
          <h1 className="text-3xl font-black tracking-tight text-foreground">Find a Provider</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search the public directory by city, state, or ZIP code. Confirm service-area availability with a provider before booking.
          </p>
        </section>

        {/* Search bar */}
        <section className="mb-8">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">Service location</label>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="City, state, or ZIP code"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleSearch}
                className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
            </div>
          </div>
        </section>

          {/* Results */}
          <section className="space-y-4" aria-live="polite">
            {appliedQuery && !loading && (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground" role="status">
                Showing directory results for <span className="font-semibold text-foreground">{appliedQuery}</span>. Provider cards show their listed service location; confirm availability before booking.
              </p>
            )}
          {loading && Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="flex gap-4 rounded-lg border border-border bg-card p-4">
              <div className="h-24 w-24 flex-shrink-0 animate-pulse rounded-md bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}

          {!loading && providers.map((provider, index) => (
            <div
              key={provider.userId}
              className="grid gap-3 rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-md sm:grid-cols-[5rem_1fr] sm:p-4"
            >
              <div className="h-32 w-full overflow-hidden rounded-md bg-muted sm:h-20 sm:w-20">
                <img
                  src={provider.image || DEFAULT_IMAGES[index % DEFAULT_IMAGES.length]}
                  alt={`${provider.businessName} — mobile service provider`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <h2 className="truncate text-lg font-bold text-foreground">{provider.businessName}</h2>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {formatLocation(provider)}
                  </div>
                </div>
                {provider.services.length > 0 && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {provider.services.join(" • ")}
                  </p>
                )}
                <div className="mt-3 flex gap-2"><Link to={`/find-provider/${provider.slug}`} className="inline-flex h-10 flex-1 items-center justify-center rounded-md border px-3 text-xs font-semibold hover:bg-muted">View Profile</Link><Link to={`/book/${provider.slug}`} className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Book Now</Link></div>
              </div>
            </div>
          ))}

          {!loading && totalCount > PAGE_SIZE && (
            <ListPagination
              totalCount={totalCount}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="providers"
            />
          )}

          {!loading && !hasSearched && !error && (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <MapPin className="mx-auto mb-3 h-10 w-10 text-primary" aria-hidden="true" />
              <p className="font-semibold text-foreground">Search for service near you</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter a city, state, or ZIP code to see providers who list service in that area.
              </p>
            </div>
          )}

          {!loading && hasSearched && !error && providers.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="font-semibold text-foreground">{`No providers found near "${appliedQuery}".`}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a nearby city or ZIP code, or contact us for help finding service.
              </p>
              <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                <button onClick={clearSearch} className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-muted">
                  Try another location
                </button>
                <Link to="/contact" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  Get help
                </Link>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="font-semibold text-foreground">{error}</p>
              <button
                onClick={() => hasSearched && void fetchProviders(appliedQuery, page)}
                className="mt-3 rounded-md border border-primary px-4 py-2 text-sm font-bold text-primary hover:bg-primary hover:text-primary-foreground"
              >
                Try again
              </button>
            </div>
          )}
        </section>
      </main>

      <MarketingSiteFooter />
    </div>
  );
}
