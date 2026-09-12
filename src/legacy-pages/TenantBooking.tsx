/**
 * TenantBooking - Entry point for subdomain-based tenant booking
 *
 * ENTERPRISE REQUIREMENT: Tenant resolution happens exactly ONCE via root TenantProvider.
 * PublicBooking consumes tenant context via useTenant.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import PublicBooking from "./PublicBooking";
import NotFound from "./NotFound";

const BOOKING_RESIZE_MESSAGE = "servicewriter:booking-resize";

/**
 * When the booking flow is rendered through /embed/booking, report the live
 * document height to the parent page so the host iframe can grow with each
 * booking step instead of forcing customers into a nested scrollbar.
 */
function useBookingEmbedAutoResize() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== "/embed/booking" || window.parent === window) return;

    let frame = 0;

    const targetOrigin = (() => {
      try {
        return document.referrer ? new URL(document.referrer).origin : "*";
      } catch {
        return "*";
      }
    })();

    const reportHeight = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const body = document.body;
        const root = document.documentElement;
        const height = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          root.scrollHeight,
          root.offsetHeight,
          root.clientHeight,
        );

        window.parent.postMessage(
          {
            type: BOOKING_RESIZE_MESSAGE,
            height,
          },
          targetOrigin,
        );
      });
    };

    reportHeight();

    const resizeObserver = new ResizeObserver(reportHeight);
    resizeObserver.observe(document.documentElement);
    resizeObserver.observe(document.body);

    const mutationObserver = new MutationObserver(reportHeight);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: false,
    });

    window.addEventListener("load", reportHeight);
    window.addEventListener("resize", reportHeight);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("load", reportHeight);
      window.removeEventListener("resize", reportHeight);
    };
  }, [location.pathname]);
}

/**
 * Inner component that consumes tenant context
 */
function TenantBookingContent() {
  const { loading, isValid, slug, errorKind, retry } = useTenant();

  useBookingEmbedAutoResize();

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
