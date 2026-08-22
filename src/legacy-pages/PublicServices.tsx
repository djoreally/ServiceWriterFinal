import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Loader2, Phone, Tag, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchBusinessBySlug, type PublicBusinessProfile } from "@/application/queries/public-business.query";
import {
  fetchPublicServiceCatalog,
  fetchPublicServicePackages,
} from "@/application/queries/public-booking.query";
import { formatDollarsAsCurrency } from "@/lib/financialMath";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";

type PublicService = {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  estimated_duration: number | null;
  category: string | null;
};

type PublicPackage = {
  id: string;
  name: string;
  description: string | null;
  package_price: number;
  estimated_duration: number | null;
  services?: unknown;
};

interface PublicServicesProps {
  tenantSlug?: string | null;
  embedded?: boolean;
}

function formatDuration(minutes: number | null) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function getBookingUrl(slug: string, isTenantRoute: boolean) {
  return isTenantRoute ? "/" : `/book/${slug}`;
}

export default function PublicServices({ tenantSlug, embedded = false }: PublicServicesProps = {}) {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const slug = tenantSlug || routeSlug;
  const isEmbed = embedded || searchParams.get("embed") === "true";
  const isTenantRoute = Boolean(tenantSlug);

  const [business, setBusiness] = useState<PublicBusinessProfile | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [packages, setPackages] = useState<PublicPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadServices() {
      if (!slug) {
        setError("Invalid service listing link.");
        setLoading(false);
        return;
      }

      try {
        const profile = await fetchBusinessBySlug(slug);
        if (!profile) {
          if (isMounted) setError("We couldn't find this service listing.");
          return;
        }

        const [servicesResult, packagesResult] = await Promise.all([
          fetchPublicServiceCatalog(slug),
          fetchPublicServicePackages(slug),
        ]);

        if (!isMounted) return;

        if (servicesResult.error) throw servicesResult.error;
        if (packagesResult.error) throw packagesResult.error;

        setBusiness(profile);
        setServices((servicesResult.data || []) as PublicService[]);
        setPackages((packagesResult.data || []) as PublicPackage[]);
      } catch (err) {
        console.error("Error loading public services:", err);
        if (isMounted) setError("Services are temporarily unavailable. Please try again soon.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadServices();

    return () => {
      isMounted = false;
    };
  }, [slug]);

  const groupedServices = useMemo(() => {
    return services.reduce<Record<string, PublicService[]>>((groups, service) => {
      const category = service.category || "Services";
      groups[category] = [...(groups[category] || []), service];
      return groups;
    }, {});
  }, [services]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading services...</p>
        </div>
      </div>
    );
  }

  if (error || !business || !slug) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md text-center">
          <CardContent className="pt-6 space-y-4">
            <Wrench className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">{error || "Service listing not found."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const bookingUrl = getBookingUrl(slug, isTenantRoute);

  return (
    <div className={isEmbed ? "bg-background text-foreground" : "min-h-screen bg-muted/30 text-foreground"}>
      <main className={isEmbed ? "p-4" : "mx-auto max-w-5xl px-4 py-10 md:px-6"}>
        <section className="mb-6 rounded-2xl border bg-card p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {business.logo_url ? (
                <ProgressiveImage src={business.logo_url} alt={business.business_name} className="h-12 w-12 rounded-xl object-cover" placeholderClassName="h-12 w-12 rounded-xl" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Wrench className="h-6 w-6" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold">{business.business_name}</h1>
                <p className="text-sm text-muted-foreground">Browse services and packages before booking.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link to={bookingUrl} target={isEmbed ? "_blank" : undefined} rel={isEmbed ? "noopener noreferrer" : undefined}>
                  Book Now
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              {business.phone && (
                <Button variant="outline" asChild>
                  <a href={`tel:${business.phone}`}>
                    <Phone className="mr-2 h-4 w-4" />
                    Call
                  </a>
                </Button>
              )}
            </div>
          </div>
        </section>

        {packages.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Service Packages</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {packages.map((pkg) => (
                <Card key={pkg.id} className="h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">{pkg.name}</CardTitle>
                        {pkg.description && <CardDescription className="mt-1">{pkg.description}</CardDescription>}
                      </div>
                      <Badge variant="secondary">Package</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <span className="text-lg font-bold text-primary">{formatDollarsAsCurrency(pkg.package_price)}</span>
                    {formatDuration(pkg.estimated_duration) && (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {formatDuration(pkg.estimated_duration)}
                      </span>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Services</h2>
          </div>

          {services.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Services will appear here soon.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedServices).map(([category, categoryServices]) => (
                <div key={category}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{category}</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {categoryServices.map((service) => (
                      <Card key={service.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                <h4 className="font-semibold">{service.name}</h4>
                              </div>
                              {service.description && (
                                <p className="text-sm text-muted-foreground">{service.description}</p>
                              )}
                            </div>
                            {service.default_price > 0 && (
                              <span className="whitespace-nowrap font-semibold text-primary">
                                {formatDollarsAsCurrency(service.default_price)}
                              </span>
                            )}
                          </div>
                          {formatDuration(service.estimated_duration) && (
                            <div className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              {formatDuration(service.estimated_duration)}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
