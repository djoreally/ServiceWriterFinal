/**
 * TenantBooking - Entry point for subdomain-based tenant booking
 * 
 * ENTERPRISE REQUIREMENT: Tenant resolution happens exactly ONCE via root TenantProvider.
 * PublicBooking consumes tenant context via useTenant.
 */

import { useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import PublicBooking from "./PublicBooking";
import NotFound from "./NotFound";

/**
 * Inner component that consumes tenant context
 */
function TenantBookingContent() {
  const { loading, isValid, slug, errorKind, retry } = useTenant();

  // Force light theme for public booking pages
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // A transport failure must not masquerade as "this shop doesn't exist" and
  // must never drop the customer onto the marketing homepage.
  if (errorKind === "network") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm w-full space-y-4 text-center">
          <h1 className="text-xl font-semibold">Booking is taking longer than usual</h1>
          <p className="text-sm text-muted-foreground">
            We couldn't load this booking page. Your connection is fine — please try again.
          </p>
          <button
            type="button"
            onClick={retry}
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!isValid || !slug) {
    return <NotFound />;
  }

  // Tenant context is now available via TenantProvider to all children
  return <PublicBooking tenantSlug={slug} />;
}


const TenantBooking = () => {
  return <TenantBookingContent />;
};

export default TenantBooking;
