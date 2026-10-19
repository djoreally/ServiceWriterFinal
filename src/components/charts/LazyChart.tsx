"use client";

import { Suspense, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * LazyChart — the single boundary for data-visualization weight (recharts,
 * mapbox). Chart libraries never enter the critical-path bundle: wrap the
 * lazy-imported chart component in this frame and the placeholder reserves
 * the geometry so content does not jump when the library hydrates.
 * Colors must come from the --chart-* token family (contract rule 14).
 */
export function ChartSkeleton({
  height = 240,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex w-full items-end gap-2 rounded-md border border-dashed bg-muted/15 p-4", className)}
      style={{ height }}
      role="status"
      aria-busy="true"
      aria-label="Loading chart"
    >
      {[42, 68, 55, 80, 61, 74, 50].map((bar, index) => (
        <div
          key={index}
          className="flex-1 animate-pulse rounded-sm bg-muted/60"
          style={{ height: `${bar}%` }}
        />
      ))}
    </div>
  );
}

export function LazyChart({
  children,
  height = 240,
  className,
}: {
  children: ReactNode;
  height?: number;
  className?: string;
}) {
  return (
    <Suspense fallback={<ChartSkeleton height={height} className={className} />}>
      {children}
    </Suspense>
  );
}
