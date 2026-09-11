import type { WorkforceRole } from "@/application/queries/workforce-identity.query";
export type NavItem = {
  path: string;
  label: string;
  onClick?: () => void;
  children?: NavItem[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

type Terms = {
  customer: string;
  vehicle: string;
  service: string;
  quote: string;
};

export type RoleScope = WorkforceRole | null;

export const getNavGroups = (terms: Terms, role: RoleScope = "admin"): NavGroup[] => {
  const all = buildAllGroups(terms);
  if (!role || role === "admin") return all;
  return all
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccessRoute(role, item.path)) }))
    .filter((group) => group.items.length > 0);
};

const buildAllGroups = (terms: Terms): NavGroup[] => [
  {
    label: "Dashboard",
    items: [
      { path: "/dashboard", label: "Dashboard" },
      { path: "/command-center", label: "Dispatch" },
      { path: "/reports", label: "Reports" },
    ],
  },
  {
    label: "Operations",
    items: [
      { path: "/appointments", label: "Appointments" },
      { path: "/availability", label: "Availability" },
      { path: "/weather-guard", label: "Weather Alerts" },
      { path: "/services", label: "Work Orders & History" },
      { path: "/team-os", label: "Technician Hub" },
    ],
  },
  {
    label: "Customers",
    items: [
      { path: "/customers", label: terms.customer + "s" },
      { path: "/vehicles", label: terms.vehicle + "s" },
      { path: "/vehicle-specs", label: "Customer Data" },
    ],
  },
  {
    label: "Services",
    items: [
      { path: "/service-catalog", label: terms.service + " Catalog" },
      { path: "/service-packages", label: "Service Packages" },
      { path: "/tire-pricing", label: "Tire Pricing" },
      { path: "/detailing-pricing", label: "Detailing Pricing" },
      { path: "/subscriptions", label: "Memberships" },
    ],
  },
  {
    label: "Finance",
    items: [
      { path: "/quotes", label: terms.quote + "s" },
      { path: "/invoices", label: "Invoices" },
      { path: "/payments", label: "Payments" },
      { path: "/expenses", label: "Expenses" },
      { path: "/inventory", label: "Inventory" },
      { path: "/settings?tab=payments&subtab=coupons", label: "Coupons" },
      { path: "/financials", label: "Financial Analytics" },
      { path: "/pricing-tool", label: "Job Pricing" },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { path: "/marketplace", label: "Marketplace Dashboard" },
      { path: "/marketplace/listing", label: "Marketplace Listing" },
      { path: "/marketplace/leads", label: "Booking Requests" },
      { path: "/marketplace/reviews", label: "Reviews" },
      { path: "/marketplace/analytics", label: "Marketplace Analytics" },
    ],
  },
  {
    label: "CRM",
    items: [
      { path: "/crm", label: "CRM Dashboard" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { path: "/growth-tools", label: "Growth Tools" },
      { path: "/retention-engine", label: "Retention Engine" },
      { path: "/newsletter", label: "Newsletters" },
    ],
  },
  {
    label: "Communications",
    items: [
      { path: "/messages", label: "Messages" },
      { path: "/receptionist", label: "AI Receptionist" },
      { path: "/assets", label: "Media Library" },
    ],
  },
  {
    label: "Settings",
    items: [
      { path: "/settings", label: "Settings" },
    ],
  },
  {
    label: "Help",
    items: [
      { path: "/knowledge-base", label: "Knowledge Base" },
      { path: "/tutorials", label: "Video Tutorials" },
      { path: "/whats-new", label: "What's New" },
      { path: "/support", label: "Contact Support" },
    ],
  },
];

export const getPrimaryNavItems = (terms: Terms, role: RoleScope = "admin"): NavItem[] =>
  getNavGroups(terms, role).flatMap((group) =>
    group.items.flatMap((item) => (item.children && item.children.length > 0 ? [item, ...item.children] : [item]))
  );

export const footerNavItems: NavItem[] = [];

export const getFooterNavItems = (_role: RoleScope = "admin"): NavItem[] => [];
