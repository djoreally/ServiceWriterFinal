import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ResponsiveRecordDetail {
  label: string;
  value: React.ReactNode;
}

export interface ResponsiveRecordProps extends React.HTMLAttributes<HTMLElement> {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  slot?: React.ReactNode;
  status?: React.ReactNode;
  meta?: React.ReactNode;
  details?: ResponsiveRecordDetail[];
  actions?: React.ReactNode;
  onOpen?: () => void;
  revealLabel?: string;
}

/**
 * Application-wide responsive record primitive.
 *
 * Rank      primary > secondary > meta
 * Stack     mobile-first vertical hierarchy
 * Slot      stable right-side critical value/status region
 * Label     detail values retain explicit labels
 * Reveal    secondary fields remain available in-place
 * Breakpoint container-owned instead of viewport-owned
 */
export function ResponsiveRecord({
  primary,
  secondary,
  slot,
  status,
  meta,
  details = [],
  actions,
  onOpen,
  revealLabel = "Details",
  className,
  ...props
}: ResponsiveRecordProps) {
  const [expanded, setExpanded] = React.useState(false);
  const hasReveal = details.length > 0;

  return (
    <article
      className={cn(
        "[container-type:inline-size] overflow-hidden rounded-xl border bg-card text-card-foreground",
        className,
      )}
      {...props}
    >
      <div
        className={cn("p-4", onOpen && "cursor-pointer hover:bg-muted/20")}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (!onOpen) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{primary}</div>
            {secondary ? <div className="mt-0.5 truncate text-sm text-muted-foreground">{secondary}</div> : null}
          </div>
          {(slot || status) ? (
            <div className="shrink-0 text-right">
              {slot ? <div className="font-semibold tabular-nums">{slot}</div> : null}
              {status ? <div className="mt-1 flex justify-end">{status}</div> : null}
            </div>
          ) : null}
        </div>
        {meta ? <div className="mt-3 text-sm text-muted-foreground">{meta}</div> : null}
      </div>

      {(hasReveal || actions) ? (
        <div className="border-t border-border/60 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            {hasReveal ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {expanded ? "Hide details" : revealLabel}
              </Button>
            ) : <span />}
            {actions}
          </div>

          {expanded ? (
            <dl className="grid gap-2 px-1 pb-2 pt-2 text-sm @min-[560px]:grid-cols-2">
              {details.map((detail) => (
                <div key={detail.label} className="flex min-w-0 items-start justify-between gap-4 rounded-md bg-muted/20 px-3 py-2">
                  <dt className="shrink-0 text-muted-foreground">{detail.label}</dt>
                  <dd className="min-w-0 text-right font-medium">{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
