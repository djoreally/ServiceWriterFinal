import { canAccessRoute } from "@/domain/auth/access-policy";
import type { WorkforceRole } from "@/application/queries/workforce-identity.query";

export type NavItem = { path: string; label: string; onClick?: () => void; children?: NavItem[] };
export type NavGroup = { label: string; items: NavItem[] };
type Terms = { customer: string; vehicle: string; service: string; quote: string };
export type RoleScope = WorkforceRole | null;

export const getNavGroups = (terms: Terms, role: RoleScope = "admin"): NavGroup[] => {
  const all = buildAllGroups(terms);
  if (!role || role === "admin") return all;
  return all
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccessRoute(role, item.path)) }))
    .filter((group) => group.items.length > 0);
};

// Shippable Service Writer product boundary.
// Non-core modules remain in the codebase but are intentionally hidden from navigation.
const buildAllGroups = (terms: Terms): NavGroup[] => [
  { label: "Dashboard", items: [{ path: "/dashboard", label: "Dashboard" }] },
  {
    label: "Customers",
    items: [
      { path: "/customers", label: terms.customer + "s" },
      { path: "/vehicles", label: terms.vehicle + "s" },
    ],
  },
  {
    label: "Services",
    items: [
      { path: "/service-catalog", label: terms.service + " Catalog" },
      { path: "/appointments", label: "Appointments" },
      { path: "/services", label: "Work Orders & History" },
    ],
  },
  {
    label: "Finance",
    items: [
      { path: "/quotes", label: terms.quote + "s" },
      { path: "/invoices", label: "Invoices" },
      { path: "/payments", label: "Payments" },
    ],
  },
  {
    label: "Business",
    items: [{ path: "/settings", label: "Business Settings" }],
  },
];

export const getPrimaryNavItems = (terms: Terms, role: RoleScope = "admin"): NavItem[] =>
  getNavGroups(terms, role).flatMap((group) =>
    group.items.flatMap((item) => (item.children && item.children.length > 0 ? [item, ...item.children] : [item]))
  );

export const footerNavItems: NavItem[] = [];
export const getFooterNavItems = (_role: RoleScope = "admin"): NavItem[] => [];
