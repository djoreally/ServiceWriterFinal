/**
 * FleetViewPrimitives — shared presentational chrome for the Fleet OS surfaces.
 *
 * Visual/UX only. No data logic lives here: every component is a pure function
 * of its props. The page H1 is owned by TopHeader (FleetOSLayout `title` prop),
 * so nothing in this file renders an h1.
 *
 * Type roles (Ty's approved scale):
 *   - eyebrow: 12px uppercase, muted — context before content
 *   - section titles: H2 24px (text-2xl) / card titles H3 18px (text-lg)
 *   - body 16px, compact 14px, caption 12px
 *   - data (money, VIN, plate, unit, WO #, times): 14px mono
 * Signal discipline: primary blue is reserved for the single primary CTA per
 * view, active/selected states, focus rings, and the one key metric per KPI
 * strip. Status categorization uses the semantic-status registry pastels.
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { getSemanticStatus, type SemanticDomain } from "@/lib/semantic-status";
import { cn } from "@/lib/utils";

/** Whole dollars, compact. All money renders through this so data reads as data. */
export const fmtMoney = (n: number): string =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/**
 * Page context bar: eyebrow + one plain-language line + actions.
 * Rendered under the TopHeader H1; uses a paragraph, not a heading.
 */
export function FleetIntro({
  eyebrow,
  description,
  actions,
}: {
  eyebrow: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {eyebrow}
        </p>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/** KPI card: caption label + 30px mono numeral. `tone` colors the numeral only. */
export function FleetKpi({
  label,
  value,
  tone,
  hint,
  onClick,
}: {
  label: string;
  value: string | number;
  tone?: "default" | "signal" | "warning" | "critical";
  hint?: string;
  onClick?: () => void;
}) {
  const toneClass =
    tone === "signal"
      ? "text-primary"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "critical"
          ? "text-red-600 dark:text-red-400"
          : "text-foreground";
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1.5 font-mono text-3xl font-semibold tracking-tight", toneClass)}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const classes =
    "min-w-0 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-colors";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "cursor-pointer hover:border-primary/40")}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}

/** Status pill from the canonical semantic registry — one hue per status family. */
export function FleetStatusPill({
  domain,
  status,
  label,
  className,
}: {
  domain: SemanticDomain;
  status: string | null | undefined;
  label?: string;
  className?: string;
}) {
  const meta = getSemanticStatus(domain, status);
  return (
    <Badge variant="secondary" className={cn(meta.badgeClass, "shrink-0", className)}>
      {label ?? meta.label}
    </Badge>
  );
}

/** Skeleton rows for list surfaces while data loads. */
export function FleetListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton grid for KPI strips while data loads. */
export function FleetKpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-3 h-8 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** Plain-language error surface with a retry action. Never a blank screen. */
export function FleetError({
  title = "Couldn't load this",
  message = "Something went wrong on our end. Your data is safe — try again.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry: () => void;
}) {
  return (
    <Card className="border-border">
      <CardContent className="flex flex-col items-center py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </span>
        <p className="mt-4 text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={onRetry}>
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
