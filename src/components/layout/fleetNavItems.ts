import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Users,
  MapPin,
  FileText,
  Car,
  ClipboardList,
  Receipt,
  ShoppingCart,
  BarChart3,
  Settings,
  LifeBuoy,
  ScanLine,
  Radio,
  CalendarClock,
  Mail,
  Inbox,
} from "lucide-react";

export type FleetNavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  description?: string;
};

/**
 * Fleet Client Structure Model:
 *   Fleet Client (top-level entity)
 *     → Contacts    (people & roles)
 *     → Locations   (service sites)
 *     → Contracts   (pricing & SLAs)
 *     → Vehicles    (core asset layer)
 *     → Work Orders (service jobs)
 *     → Invoices    (billing & AR)
 *     → POs         (purchase orders)
 *
 * Sidebar follows design philosophy: § 12
 * "Everything flows from vehicle or work order."
 *
 * Every route listed here has a concrete Fleet OS page and is visible in
 * production now that Fleet OS is part of the free all-access bundle.
 */

const allFleetNavItems: FleetNavItem[] = [
  { path: "/fleet-os", label: "Overview", icon: LayoutDashboard, description: "Fleet health" },
  { path: "/fleet-os/command-center", label: "Command Center", icon: Radio, description: "Unified live operations" },
  { path: "/fleet-os/requests", label: "Requests", icon: Inbox, description: "Service intake queue" },
  { path: "/fleet-os/clients", label: "Clients", icon: Building2, description: "Fleet accounts" },
  { path: "/fleet-os/vehicles", label: "Vehicles", icon: Car, description: "Core asset layer" },
  { path: "/fleet-os/work-orders", label: "Work Orders", icon: ClipboardList, description: "Service lifecycle" },
  { path: "/fleet-os/locations", label: "Locations", icon: MapPin, description: "Service sites" },
  { path: "/fleet-os/contracts", label: "Contracts", icon: FileText, description: "Pricing & SLAs" },
  { path: "/fleet-os/invoices", label: "Invoices", icon: Receipt, description: "Billing & AR" },
  { path: "/fleet-os/pos", label: "POs", icon: ShoppingCart, description: "Purchase orders" },
  { path: "/fleet-os/reports", label: "Reports", icon: BarChart3, description: "Analytics" },
  { path: "/fleet-os/contacts", label: "Contacts", icon: Users, description: "People & roles" },
  { path: "/fleet-os/email", label: "Email", icon: Mail, description: "Two-way customer inbox" },
  { path: "/fleet-os/scheduler", label: "Scheduler", icon: CalendarClock, description: "Dispatch and monthly operations" },
  { path: "/fleet-os/checkin", label: "Check-In", icon: ScanLine, description: "Mobile geo check-in" },
];

export const fleetNavItems: FleetNavItem[] = allFleetNavItems;

export const fleetFooterItems: FleetNavItem[] = [
  { path: "/fleet-os/help", label: "Fleet OS Help", icon: LifeBuoy },
  { path: "/settings", label: "Settings", icon: Settings },
];
