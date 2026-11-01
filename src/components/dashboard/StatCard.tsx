/**
 * StatCard (canonical, Total Redesign) — the one stat tile every screen
 * composes from: a label, a value, an optional honest hint, and an
 * optional tap target.
 *
 * Contract (sw-homepage-spec-2026-10-31 §A3.1): there is deliberately NO
 * chart, sparkline, or trend-series prop. A number rendered here is a
 * fact from the payload, never a decoration — the legacy card's
 * fabricated rising fallback sparkline is exactly what this contract
 * bans (that component survives only as LegacyStatCard for screens not
 * yet reworked). Callers format values; money arrives pre-formatted.
 */
import { memo } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  /** Pre-formatted display value (money arrives as "$1,234"). */
  value: string;
  /** One honest line under the value — a comparison or a breakdown. */
  hint?: string;
  /** accent = money in; attention = money owed / aging. */
  tone?: "default" | "accent" | "attention";
  /** When set, the whole tile is the tap target. */
  href?: string;
}

export const StatCard = memo(function StatCard({
  label,
  value,
  hint,
  tone = "default",
  href,
}: StatCardProps) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "type-kpi mt-1 text-foreground",
          tone === "accent" && "text-primary",
          tone === "attention" && "text-attention-fg",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </>
  );

  if (href) {
    return (
      <Card className="h-full transition-colors hover:border-primary/40">
        <Link
          to={href}
          className="block h-full p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
          aria-label={hint ? `${label}: ${value}. ${hint}` : `${label}: ${value}`}
        >
          {body}
        </Link>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <div className="p-4 sm:p-5">{body}</div>
    </Card>
  );
});
