import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Archive,
  Ban,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Coffee,
  Eye,
  FileText,
  MapPin,
  Package,
  PauseCircle,
  RefreshCw,
  Route,
  Sparkles,
  Truck,
  UserCheck,
  Wrench,
  XCircle,
} from "lucide-react";

export type SemanticSeverity =
  | "neutral"
  | "info"
  | "active"
  | "blocked"
  | "success"
  | "danger"
  | "intelligence";

export type SemanticStatusStyle = {
  label: string;
  icon: LucideIcon;
  severity: SemanticSeverity;
  badgeClass: string;
  chipClass: string;
  surfaceClass: string;
  dotClass: string;
};

const PALETTES = {
  gray: {
    badge: "bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/30",
    chip: "bg-gray-500/85 text-white", surface: "border-l-gray-500", dot: "bg-gray-500",
  },
  blue: {
    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    chip: "bg-blue-500/85 text-white", surface: "border-l-blue-500", dot: "bg-blue-500",
  },
  cyan: {
    badge: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
    chip: "bg-cyan-500/85 text-white", surface: "border-l-cyan-500", dot: "bg-cyan-500",
  },
  indigo: {
    badge: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
    chip: "bg-indigo-500/85 text-white", surface: "border-l-indigo-500", dot: "bg-indigo-500",
  },
  amber: {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    chip: "bg-amber-500/85 text-white", surface: "border-l-amber-500", dot: "bg-amber-500",
  },
  orange: {
    badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
    chip: "bg-orange-500/85 text-white", surface: "border-l-orange-500", dot: "bg-orange-500",
  },
  yellow: {
    badge: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300 border-yellow-500/30",
    chip: "bg-yellow-500/85 text-black", surface: "border-l-yellow-500", dot: "bg-yellow-500",
  },
  emerald: {
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    chip: "bg-emerald-500/85 text-white", surface: "border-l-emerald-500", dot: "bg-emerald-500",
  },
  green: {
    badge: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
    chip: "bg-green-500/85 text-white", surface: "border-l-green-500", dot: "bg-green-500",
  },
  red: {
    badge: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    chip: "bg-red-500/85 text-white", surface: "border-l-red-500", dot: "bg-red-500",
  },
  purple: {
    badge: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
    chip: "bg-purple-500/85 text-white", surface: "border-l-purple-500", dot: "bg-purple-500",
  },
} as const;

type PaletteName = keyof typeof PALETTES;

const style = (
  label: string,
  icon: LucideIcon,
  severity: SemanticSeverity,
  paletteName: PaletteName,
  _lightText?: string,
  _darkText?: string,
  options: { muted?: boolean } = {},
): SemanticStatusStyle => {
  const palette = PALETTES[paletteName];
  return {
    label,
    icon,
    severity,
    badgeClass: palette.badge,
    chipClass: palette.chip,
    surfaceClass: `bg-card border-l-4 ${palette.surface} border-border${options.muted ? " opacity-70" : ""}`,
    dotClass: palette.dot,
  };
};

/**
 * One semantic language for operational state across Service Writer.
 *
 * Rules:
 * - blue/cyan: planned or informational
 * - indigo: travel
 * - amber: active work
 * - orange: blocked or needs intervention
 * - green: successful
 * - red: failed or negatively closed
 * - gray: neutral/inactive
 * - purple: AI, prediction, or experimental intelligence only
 *
 * Color is never the sole signal: every entry includes a label and icon.
 */
export const SEMANTIC_STATUS = {
  appointment: {
    draft: style("Draft", FileText, "neutral", "gray", "gray-700", "gray-300"),
    new: style("New", CalendarClock, "info", "blue", "blue-700", "blue-300"),
    pending: style("Pending", Clock, "info", "blue", "blue-700", "blue-300"),
    scheduled: style("Scheduled", CalendarClock, "info", "blue", "blue-700", "blue-300"),
    confirmed: style("Confirmed", CheckCircle2, "info", "cyan", "cyan-700", "cyan-300"),
    rescheduled: style("Rescheduled", RefreshCw, "info", "blue", "blue-700", "blue-300"),
    assigned: style("Assigned", UserCheck, "info", "blue", "blue-700", "blue-300"),
    en_route: style("En Route", Route, "active", "indigo", "indigo-700", "indigo-300"),
    arrived: style("Arrived", MapPin, "active", "amber", "amber-700", "amber-300"),
    on_site: style("On Site", MapPin, "active", "amber", "amber-700", "amber-300"),
    inspection: style("Inspection", Eye, "active", "amber", "amber-700", "amber-300"),
    in_progress: style("In Progress", Wrench, "active", "amber", "amber-700", "amber-300"),
    blocked: style("Blocked", PauseCircle, "blocked", "orange", "orange-700", "orange-300"),
    waiting_on_customer: style("Waiting on Customer", Clock, "blocked", "orange", "orange-700", "orange-300"),
    waiting_on_parts: style("Waiting on Parts", Package, "blocked", "orange", "orange-700", "orange-300"),
    ready_for_payment: style("Ready for Payment", CircleDollarSign, "blocked", "yellow", "yellow-800", "yellow-300"),
    completed: style("Completed", CheckCircle2, "success", "emerald", "emerald-700", "emerald-300"),
    invoiced: style("Invoiced", FileText, "info", "blue", "blue-700", "blue-300"),
    paid: style("Paid", CircleDollarSign, "success", "green", "green-700", "green-300"),
    cancelled: style("Cancelled", XCircle, "danger", "red", "red-700", "red-300", { muted: true }),
    no_show: style("No Show", Ban, "danger", "red", "red-800", "red-300", { muted: true }),
  },
  technician: {
    available: style("Available", CheckCircle2, "success", "green", "green-700", "green-300"),
    busy: style("Busy", Clock, "active", "amber", "amber-700", "amber-300"),
    driving: style("Driving", Route, "info", "blue", "blue-700", "blue-300"),
    en_route: style("En Route", Route, "info", "blue", "blue-700", "blue-300"),
    on_site: style("On Site", MapPin, "active", "amber", "amber-700", "amber-300"),
    on_job: style("On Job", Wrench, "active", "amber", "amber-700", "amber-300"),
    on_break: style("On Break", Coffee, "neutral", "gray", "gray-700", "gray-300"),
    offline: style("Offline", XCircle, "neutral", "gray", "gray-700", "gray-300", { muted: true }),
    unavailable: style("Unavailable", Ban, "neutral", "gray", "gray-700", "gray-300", { muted: true }),
    emergency: style("Emergency", AlertTriangle, "danger", "red", "red-700", "red-300"),
  },
  invoice: {
    draft: style("Draft", FileText, "neutral", "gray", "gray-700", "gray-300"),
    sent: style("Sent", FileText, "info", "blue", "blue-700", "blue-300"),
    viewed: style("Viewed", Eye, "info", "cyan", "cyan-700", "cyan-300"),
    partial_payment: style("Partial Payment", CircleDollarSign, "active", "amber", "amber-700", "amber-300"),
    paid: style("Paid", CircleDollarSign, "success", "green", "green-700", "green-300"),
    refunded: style("Refunded", RefreshCw, "neutral", "gray", "gray-700", "gray-300"),
    overdue: style("Overdue", AlertTriangle, "danger", "red", "red-700", "red-300"),
  },
  payment: {
    authorized: style("Authorized", CheckCircle2, "info", "blue", "blue-700", "blue-300"),
    paid: style("Paid", CircleDollarSign, "success", "green", "green-700", "green-300"),
    partial: style("Partial", CircleDollarSign, "active", "amber", "amber-700", "amber-300"),
    failed: style("Failed", XCircle, "danger", "red", "red-700", "red-300"),
    refunded: style("Refunded", RefreshCw, "neutral", "gray", "gray-700", "gray-300"),
    chargeback: style("Chargeback", AlertTriangle, "danger", "red", "red-800", "red-300"),
  },
  inventory: {
    in_stock: style("In Stock", CheckCircle2, "success", "green", "green-700", "green-300"),
    low_stock: style("Low Stock", AlertTriangle, "active", "amber", "amber-700", "amber-300"),
    out_of_stock: style("Out of Stock", XCircle, "danger", "red", "red-700", "red-300"),
    on_order: style("On Order", Truck, "info", "blue", "blue-700", "blue-300"),
    discontinued: style("Discontinued", Archive, "neutral", "gray", "gray-700", "gray-300", { muted: true }),
  },
  marketplace: {
    active: style("Listing Active", CheckCircle2, "success", "green", "green-700", "green-300"),
    paused: style("Paused", PauseCircle, "active", "amber", "amber-700", "amber-300"),
    hidden: style("Hidden", Eye, "neutral", "gray", "gray-700", "gray-300", { muted: true }),
    suspended: style("Suspended", Ban, "danger", "red", "red-700", "red-300"),
    featured: style("Featured", Sparkles, "info", "blue", "blue-700", "blue-300"),
  },
  customerLifecycle: {
    active: style("Active", CheckCircle2, "success", "green", "green-700", "green-300"),
    inactive: style("Inactive", Archive, "neutral", "gray", "gray-700", "gray-300", { muted: true }),
    lost: style("Lost", XCircle, "danger", "red", "red-700", "red-300", { muted: true }),
  },
  customerSegment: {
    retail: style("Retail", UserCheck, "neutral", "gray", "gray-700", "gray-300"),
    fleet: style("Fleet", Truck, "info", "blue", "blue-700", "blue-300"),
    commercial: style("Commercial", Truck, "info", "blue", "blue-700", "blue-300"),
  },
  customerRelationship: {
    new: style("New", UserCheck, "info", "blue", "blue-700", "blue-300"),
    returning: style("Returning", RefreshCw, "success", "green", "green-700", "green-300"),
  },
  customerPriority: {
    standard: style("Standard", UserCheck, "neutral", "gray", "gray-700", "gray-300"),
    vip: style("VIP", Sparkles, "active", "amber", "amber-700", "amber-300"),
  },
  customerAction: {
    follow_up_required: style("Follow-up Required", Clock, "active", "amber", "amber-700", "amber-300"),
  },
  vehicle: {
    healthy: style("Healthy", CheckCircle2, "success", "green", "green-700", "green-300"),
    due_soon: style("Maintenance Due Soon", Clock, "active", "amber", "amber-700", "amber-300"),
    overdue: style("Overdue", AlertTriangle, "danger", "red", "red-700", "red-300"),
    recall: style("Recall", AlertTriangle, "blocked", "orange", "orange-700", "orange-300"),
    out_of_service: style("Out of Service", Ban, "danger", "red", "red-800", "red-300", { muted: true }),
    inspection_required: style("Inspection Required", Eye, "active", "amber", "amber-700", "amber-300"),
  },
  fleetAsset: {
    active: style("Active", Truck, "success", "green", "green-700", "green-300"),
    maintenance: style("Maintenance", Wrench, "active", "amber", "amber-700", "amber-300"),
    inactive: style("Inactive", Archive, "neutral", "gray", "gray-700", "gray-300", { muted: true }),
  },
  intelligence: {
    ai: style("AI", Bot, "intelligence", "purple", "purple-700", "purple-300"),
    forecast: style("Forecast", Sparkles, "intelligence", "purple", "purple-700", "purple-300"),
  },
} as const;

export type SemanticDomain = keyof typeof SEMANTIC_STATUS;

const FALLBACK = style("Unknown", AlertTriangle, "neutral", "gray", "gray-700", "gray-300");

export function getSemanticStatus(
  domain: SemanticDomain,
  status: string | null | undefined,
): SemanticStatusStyle {
  if (!status) return FALLBACK;
  const normalized = status.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const registry = SEMANTIC_STATUS[domain] as Record<string, SemanticStatusStyle>;
  return registry[normalized] ?? FALLBACK;
}
