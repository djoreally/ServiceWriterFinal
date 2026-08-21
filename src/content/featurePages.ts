import { productShots } from "@/content/productShots";

export type FeaturePage = {
  slug: string;
  name: string;
  summary: string;
  heroImage: string;
  highlights: string[];
};

export const featurePages: FeaturePage[] = [
  {
    slug: "booking-scheduling",
    name: "Booking & Scheduling",
    summary: "Control availability, service slots, and customer booking intake in one workflow.",
    heroImage: productShots.servicePackages,
    highlights: [
      "Branded booking flows for customers and fleet accounts",
      "Availability controls with lead times, buffers, and blackout windows",
      "Live appointment visibility for office and field teams",
    ],
  },
  {
    slug: "dispatch-fleet",
    name: "Dispatch & Fleet Operations",
    summary: "Assign faster, reduce windshield time, and manage mixed residential/fleet workloads.",
    heroImage: productShots.inventoryItems,
    highlights: [
      "Dispatch planning from a single operations view",
      "Technician and van assignment with status tracking",
      "Fleet work orders, contracts, and client account structure",
    ],
  },
  {
    slug: "payments-invoicing",
    name: "Payments & Invoicing",
    summary: "Move from completed job to paid invoice with clean operational and financial records.",
    heroImage: productShots.payments,
    highlights: [
      "Quote-to-payment workflow support",
      "Transaction visibility for revenue reporting",
      "Flexible payment collection motions for field teams",
    ],
  },
  {
    slug: "customer-vehicle-history",
    name: "Customer & Vehicle History",
    summary: "Keep complete service context on every customer and vehicle so repeat visits stay efficient.",
    heroImage: productShots.vehicleSpecs,
    highlights: [
      "Profile-level continuity across visits",
      "Technician-ready context before job start",
      "Service record visibility for retention and upsell timing",
    ],
  },
  {
    slug: "growth-tools",
    name: "Growth Tools",
    summary: "Coordinate campaigns, reviews, local profile activity, and growth analytics in one place.",
    heroImage: productShots.subscriptions,
    highlights: [
      "Campaign and follow-up coordination",
      "Review and testimonial workflows",
      "Google My Business workspace for local visibility operations",
    ],
  },
  {
    slug: "reporting-retention",
    name: "Reporting & Retention",
    summary: "Turn activity data into decisions around margin, repeat behavior, and capacity planning.",
    heroImage: productShots.financials,
    highlights: [
      "Operational and financial trend visibility",
      "Retention signal tracking for proactive follow-up",
      "Decision-ready summaries for owners and managers",
    ],
  },
  {
    slug: "technician-os",
    name: "Technician OS",
    summary: "Give technicians a focused, mobile-first interface for job execution and updates.",
    heroImage: productShots.inventoryOilUsage,
    highlights: [
      "In-field status updates and execution flow",
      "Job context, notes, and handoff consistency",
      "Reduced communication lag between dispatch and field operations",
    ],
  },
  {
    slug: "ai-assistant",
    name: "AI Assistant",
    summary: "Use AI as an operations co-pilot for summaries, drafting, and faster information retrieval.",
    heroImage: productShots.inventoryEmpty,
    highlights: [
      "Operational context support for managers and service advisors",
      "Faster customer-history and schedule intelligence",
      "Guided assistance without losing human decision control",
    ],
  },
];

export const featurePageBySlug = Object.fromEntries(featurePages.map((f) => [f.slug, f])) as Record<string, FeaturePage>;
