import { canAccessRoute } from "@/domain/auth/access-policy";
import type { WorkforceRole } from "@/application/queries/workforce-identity.query";

export type NavItem = { path: string; label: string; onClick?: () => void; children?: NavItem[] };
export type NavGroup = { label: string; items: NavItem[] };
type Terms = { customer: string; vehicle: string; service: string; quote: string };
export type RoleScope = WorkforceRole | null;

export const getNavGroups = (terms: Terms, role: RoleScope = null): NavGroup[] => {
  const all = buildAllGroups(terms);
  if (!role) return [];
  if (role === "admin") return all;
  return all
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => ({
          ...item,
          children: item.children?.filter((child) => canAccessRoute(role, child.path)),
        }))
        .filter((item) => canAccessRoute(role, item.path) || (item.children?.length ?? 0) > 0),
    }))
    .filter((group) => group.items.length > 0);
};

// Canonical Service Writer navigation. Product capability stays in the product;
// authorization decides who can see/use each surface. Technician users retain
// their dedicated /tech-app landing and field workflow.
const buildAllGroups = (terms: Terms): NavGroup[] => [
  { label: "Overview", items: [
    { path: "/dashboard", label: "Command Center" },
    { path: "/command-center", label: "Live Operations" },
    { path: "/reports", label: "Reports" },
  ]},
  { label: "Customers & Vehicles", items: [
    { path: "/customers", label: terms.customer + "s" },
    { path: "/vehicles", label: terms.vehicle + "s" },
    { path: "/crm", label: "CRM" },
    { path: "/subscriptions", label: "Subscriptions" },
  ]},
  { label: "Appointments", items: [
    { path: "/appointments", label: "Appointments & Schedule" },
    { path: "/availability", label: "Availability" },
    { path: "/quotes", label: terms.quote + "s & Approvals" },
    { path: "/services", label: "Work Orders & History" },
  ]},
  { label: "Field Ops", items: [
    { path: "/dispatch-engine", label: "Dispatch" },
    { path: "/team-os", label: "Team & Technicians" },
    { path: "/fleet-os", label: "Fleet OS" },
    { path: "/fleet", label: "Vans & Fleet" },
    { path: "/field-companion", label: "Field Companion" },
    { path: "/inventory", label: "Inventory & Parts" },
    { path: "/weather-guard", label: "Weather Guard" },
  ]},
  { label: "Services", items: [
    { path: "/service-catalog", label: terms.service + " Catalog" },
    { path: "/service-packages", label: "Service Packages" },
    { path: "/pricing-tool", label: "Job Pricing" },
    { path: "/tire-pricing", label: "Tire Pricing" },
    { path: "/detailing-pricing", label: "Detailing Pricing" },
  ]},
  { label: "Finance", items: [
    { path: "/invoices", label: "Invoices" },
    { path: "/payments", label: "Payments" },
    { path: "/financials", label: "Financials" },
    { path: "/expenses", label: "Expenses" },
    { path: "/tax-compliance", label: "Tax Compliance" },
  ]},
  { label: "Communications", items: [
    { path: "/messages", label: "Messages" },
    { path: "/receptionist", label: "Receptionist" },
  ]},
  { label: "Marketing & Retention", items: [
    { path: "/marketing", label: "Marketing" },
    { path: "/newsletter", label: "Newsletter" },
    { path: "/retention-engine", label: "Retention" },
    { path: "/marketplace", label: "Marketplace" },
  ]},
  { label: "Team & Access", items: [
    { path: "/invitations", label: "Invitations" },
    { path: "/settings/sessions", label: "Sessions" },
  ]},
  { label: "Settings", items: [
    { path: "/settings", label: "Business Settings" },
    { path: "/settings/import", label: "Data Import" },
    { path: "/agent-integrations", label: "Integrations" },
  ]},
  { label: "Training & Support", items: [
    { path: "/support", label: "Support" },
    { path: "/knowledge-base", label: "Knowledge Base" },
    { path: "/tutorials", label: "Tutorials" },
    { path: "/whats-new", label: "What's New" },
  ]},
];

export const getPrimaryNavItems = (terms: Terms, role: RoleScope = null): NavItem[] =>
  getNavGroups(terms, role).flatMap((group) =>
    group.items.flatMap((item) => (item.children && item.children.length > 0 ? [item, ...item.children] : [item]))
  );

export const footerNavItems: NavItem[] = [];
export const getFooterNavItems = (_role: RoleScope = null): NavItem[] => [];
