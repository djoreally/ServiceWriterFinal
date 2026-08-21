/**
 * BookingJsonLd — Schema.org structured data for public booking pages.
 *
 * Renders a JSON-LD script tag with LocalBusiness + Service markup
 * so search engines can display rich snippets (business name, services, booking action).
 *
 * ⚡ Performance: static script tag, zero runtime overhead after mount.
 */

import { memo } from "react";

interface BookingJsonLdProps {
  businessName: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  bookingUrl: string;
  logoUrl?: string;
  services?: Array<{ name: string; price: number; description?: string | null }>;
}

export const BookingJsonLd = memo(function BookingJsonLd({
  businessName,
  description,
  address,
  city,
  state,
  postalCode,
  phone,
  email,
  bookingUrl,
  logoUrl,
  services = [],
}: BookingJsonLdProps) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "AutoRepair",
    name: businessName,
    ...(description && { description }),
    ...(logoUrl && { image: logoUrl }),
    ...(phone && { telephone: phone }),
    ...(email && { email }),
    url: bookingUrl,
    potentialAction: {
      "@type": "ReserveAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: bookingUrl,
        actionPlatform: [
          "http://schema.org/DesktopWebPlatform",
          "http://schema.org/MobileWebPlatform",
        ],
      },
      result: {
        "@type": "Reservation",
        name: `Book a service at ${businessName}`,
      },
    },
  };

  // Add address if available
  if (address || city || state || postalCode) {
    schema.address = {
      "@type": "PostalAddress",
      ...(address && { streetAddress: address }),
      ...(city && { addressLocality: city }),
      ...(state && { addressRegion: state }),
      ...(postalCode && { postalCode }),
      addressCountry: "US",
    };
  }

  // Add service offerings
  if (services.length > 0) {
    schema.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: "Auto Services",
      itemListElement: services.slice(0, 10).map((svc) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: svc.name,
          ...(svc.description && { description: svc.description }),
        },
        price: svc.price.toFixed(2),
        priceCurrency: "USD",
      })),
    };
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
});
