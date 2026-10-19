import { Loader2, WifiOff, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/layout/PagePrimitives";
import { Button } from "./button";

/**
 * State kit — the canonical loading/error/offline surfaces (contract rule 8:
 * "Empty/loading/error states are deliberate. No blank panels. Every empty
 * state says what is missing and offers one clear next action.")
 * Compose these in lists, panels, and detail views instead of hand-rolling.
 */

export function LoadingState({
  message = "Loading…",
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-h-[88px] items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/15 p-3 text-sm text-muted-foreground", className)}
      role="status"
      aria-busy="true"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function ErrorState({
  title = "This couldn't be loaded",
  description = "Check your connection and try again. Your data is safe.",
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <EmptyState
      variant="inline"
      icon={<TriangleAlert className="h-5 w-5 text-destructive" aria-hidden="true" />}
      title={title}
      description={description}
      action={onRetry && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
      className={className}
    />
  );
}

export function OfflineState({
  title = "You're offline",
  description = "Changes are saved on this device and sync when the connection returns.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <EmptyState
      variant="inline"
      icon={<WifiOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}
