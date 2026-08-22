/**
 * BookingRedirect - Legacy /book/:slug redirect handler
 * 
 * In production: redirects to subdomain format.
 * In preview/dev: renders the actual booking flow inline.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { withCurrentQuery } from "@/lib/attribution";

const TENANT_BASE_DOMAIN = "servicewriter.xyz";

const BookingRedirect = () => {
  const { slug } = useParams<{ slug: string }>();
  const [showBooking, setShowBooking] = useState(false);
  const [PublicBooking, setPublicBooking] = useState<React.ComponentType<{ tenantSlug: string }> | null>(null);

  const isPreview = typeof window !== "undefined" && (
    window.location.hostname.includes('lovable') ||
    window.location.hostname === 'localhost'
  );

  useEffect(() => {
    if (!slug) return;

    if (isPreview) {
      // In preview, dynamically load and render the actual booking flow
      import("./PublicBooking").then((mod) => {
        setPublicBooking(() => mod.default);
        setShowBooking(true);
      });
    } else {
      // In production, redirect to subdomain — preserving UTM/attribution query params
      window.location.href = withCurrentQuery(`https://${slug}.${TENANT_BASE_DOMAIN}`);
    }
  }, [slug, isPreview]);


  // Force light theme for booking pages
  useEffect(() => {
    if (showBooking) {
      const root = window.document.documentElement;
      root.classList.remove("dark");
      root.classList.add("light");
    }
  }, [showBooking]);

  if (showBooking && PublicBooking && slug) {
    return <PublicBooking tenantSlug={slug} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-bold">Booking Link Updated</h1>
        <p className="text-muted-foreground">
          The booking URL format has changed to use subdomains.
        </p>
        {slug && (
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <p className="text-sm text-muted-foreground">New booking URL:</p>
            <code className="text-primary font-mono text-lg block">
              https://{slug}.{TENANT_BASE_DOMAIN}
            </code>
            <a 
              href={withCurrentQuery(`https://${slug}.${TENANT_BASE_DOMAIN}`)}
              className="inline-block mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >

              Go to Booking Page
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookingRedirect;
