import type { LucideIcon } from "lucide-react";
import { canAccessRoute } from "@/domain/auth/access-policy";

import {
  LayoutDashboard,
  Calculator,
  Users,
  UserRoundPlus,
  Car,
  ClipboardList,
  Package,
  PackageOpen,
  FileText,
  Settings,
  BookOpen,
  CalendarClock,
  Clock,
  CreditCard,
  Megaphone,
  Database,
  Repeat,
  BadgeDollarSign,
  LifeBuoy,
  Truck,
  TrendingUp,
  Zap,
  Mail,
  MessageSquare,
  GraduationCap,
  Video,
  Sparkles,
  CircleGauge,
  Compass,
  Signal,
  Radio,
  Receipt,
  CloudRain,
  FolderOpen,
  Tag,
  Store,
  Star,
  ContactRound,
} from "lucide-react";


export type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
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

export type RoleScope = "admin" | "owner" | "manager" | "dispatcher" | "fleet_manager" | "technician" | null;

/**
 * Grouped navigation for desktop Sidebar.
 * Flat list kept via getPrimaryNavItems() for MobileNav / BottomNav.
 *
 * Filtering is delegated to the shared access policy
 * (`@/domain/auth/access-policy`) so the sidebar can never show a link whose
 * route guard would deny it.
 */
export const getNavGroups = (terms: Terms, role: RoleScope = "admin"): NavGroup[] => {
  const all = buildAllGroups(terms);
  if (!role || role === "admin") return all;

  return all
    .map((g) => ({ ...g, items: g.items.filter((i) => canAccessRoute(role, i.path)) }))
    .filter((g) => g.items.length > 0);
};


const buildAllGroups = (terms: Terms): NavGroup[] => [
  {
    label: "Dashboard",
    items: [
      { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { path: "/command-center", label: "Today", icon: Radio },
      { path: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Operations",
    items: [
      { path: "/appointments", label: "Appointments", icon: CalendarClock },
      { path: "/availability", label: "Availability", icon: Clock },
      { path: "/weather-guard", label: "Weather Alerts", icon: CloudRain },
      { path: "/services", label: "Work Orders & History", icon: ClipboardList },
      { path: "/team-os", label: "Technician Hub", icon: Zap },
      { path: "/fleet-os", label: "Fleet OS", icon: Truck },
    ],
  },
  {
    label: "Customers",
    items: [
      { path: "/customers", label: terms.customer + "s", icon: Users },
      { path: "/vehicles", label: terms.vehicle + "s", icon: Car },
      { path: "/vehicle-specs", label: "Customer Data", icon: Database },
    ],
  },
  {
    label: "Services",
    items: [
      { path: "/service-catalog", label: terms.service + " Catalog", icon: BookOpen },
      { path: "/service-packages", label: "Service Packages", icon: PackageOpen },
      { path: "/tire-pricing", label: "Tire Pricing", icon: CircleGauge },
      { path: "/detailing-pricing", label: "Detailing Pricing", icon: Sparkles },
      { path: "/subscriptions", label: "Memberships", icon: BadgeDollarSign },
    ],
  },
  {
    label: "Finance",
    items: [
      { path: "/quotes", label: terms.quote + "s", icon: FileText },
      { path: "/invoices", label: "Invoices", icon: FileText },
      { path: "/payments", label: "Payments", icon: CreditCard },
      { path: "/expenses", label: "Expenses", icon: Receipt },
      { path: "/inventory", label: "Inventory", icon: Package },
      { path: "/settings?tab=payments&subtab=coupons", label: "Coupons", icon: Tag },
      { path: "/financials", label: "Financial Analytics", icon: TrendingUp },
      { path: "/pricing-tool", label: "Job Pricing", icon: Calculator },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { path: "/marketplace", label: "Marketplace Dashboard", icon: Store },
      { path: "/marketplace/listing", label: "Marketplace Listing", icon: Store },
      { path: "/marketplace/leads", label: "Booking Requests", icon: Users },
      { path: "/marketplace/reviews", label: "Reviews", icon: Star },
      { path: "/marketplace/analytics", label: "Marketplace Analytics", icon: TrendingUp },
    ],
  },
  {
    label: "CRM",
    items: [
      { path: "/crm", label: "CRM Dashboard", icon: ContactRound },
    ],
  },
  {
    label: "Marketing",
    items: [
      { path: "/growth-tools", label: "Growth Tools", icon: Megaphone },
      { path: "/retention-engine", label: "Retention Engine", icon: Signal },
      { path: "/newsletter", label: "Newsletters", icon: Mail },
    ],
  },
  {
    label: "Communications",
    items: [
      { path: "/messages", label: "Messages", icon: MessageSquare },
      { path: "/receptionist", label: "AI Receptionist", icon: Radio },
      { path: "/assets", label: "Media Library", icon: FolderOpen },
    ],
  },
  {
    label: "Settings",
    items: [
      { path: "/settings?tab=business", label: "Business Profile", icon: Settings },
      { path: "/settings?tab=team", label: "Employees", icon: Users },
      { path: "/invitations", label: "Invitations", icon: UserRoundPlus },
      { path: "/settings?tab=integrations", label: "Integrations", icon: Zap },
      { path: "/settings?tab=payments", label: "Billing", icon: CreditCard },
      { path: "/settings?tab=comms", label: "Notifications", icon: Mail },
      { path: "/settings?tab=advanced", label: "Security & Data", icon: LifeBuoy },
    ],
  },
  {
    label: "Help",
    items: [
      { path: "/knowledge-base", label: "Knowledge Base", icon: GraduationCap },
      { path: "/tutorials", label: "Video Tutorials", icon: Video },
      { path: "/whats-new", label: "What's New", icon: Sparkles },
      { path: "/support", label: "Contact Support", icon: LifeBuoy },
    ],
  },
];

/** Flat list for MobileNav + BottomNavBar backwards compat */
export const getPrimaryNavItems = (terms: Terms, role: RoleScope = "admin"): NavItem[] =>
  getNavGroups(terms, role).flatMap((g) =>
    g.items.flatMap((item) => (item.children && item.children.length > 0 ? [item, ...item.children] : [item]))
  );

export const footerNavItems: NavItem[] = [
  {
    path: "/settings",
    label: "Settings",
    icon: Settings,
  },
];

/** Footer items filtered through the shared access policy. */
export const getFooterNavItems = (role: RoleScope = "admin"): NavItem[] => {
  if (!role) return [];
  return footerNavItems.filter((item) => canAccessRoute(role, item.path));
};

