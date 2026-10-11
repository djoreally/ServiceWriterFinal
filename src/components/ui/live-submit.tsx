import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

/**
 * LiveSubmit — never disable the button.
 *
 * The problem with disabled:
 * - Click the gray button: nothing. Nothing tells you why.
 * - Disabled drops out of tab order. Keyboard users skip past it,
 *   screen readers stay quiet. The block exists and nobody announces it.
 * - Gray on gray fails contrast. Even the label fights you.
 * - Tooltip on disabled? Pointer events are dead, so it never fires.
 *   The reason is unreachable by design.
 *
 * The fix: keep the button LIVE.
 * - On click: validate. Light up the fields blocking submit.
 * - Focus jumps to the first invalid field.
 * - Same protection, and the path forward is now visible.
 *
 * Disabled and loading are TWO DIFFERENT STATES:
 * - Loading: button holds focus, shows spinner, reports busy (aria-busy).
 *   Graying it out throws the user's place away.
 * - Blocked: button stays live, click reveals what's missing.
 */

interface FieldError {
  /** DOM id of the field to focus */
  fieldId: string;
  message: string;
}

interface LiveSubmitProps {
  /** Validate on tap. Return field errors — empty means go. */
  onValidate: () => FieldError[];
  /** The async work. Only called when validation passes. */
  onSubmit: (idempotencyKey: string) => Promise<void>;
  onSuccess?: () => void;
  children: React.ReactNode;
  variant?: "default" | "destructive" | "outline" | "secondary";
  className?: string;
}

export function LiveSubmit({
  onValidate,
  onSubmit,
  onSuccess,
  children,
  variant = "default",
  className,
}: LiveSubmitProps) {
  const [loading, setLoading] = useState(false);
  const [blockers, setBlockers] = useState<FieldError[]>([]);
  const inFlight = useRef(false);

  const handleTap = async () => {
    if (inFlight.current) return;

    // Validate first — light up what's blocking.
    const errors = onValidate();
    if (errors.length > 0) {
      setBlockers(errors);
      // Focus jumps to the first blocker.
      const el = document.getElementById(errors[0].fieldId);
      el?.focus();
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBlockers([]);

    inFlight.current = true;
    setLoading(true);
    try {
      await onSubmit(crypto.randomUUID());
      onSuccess?.();
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        onClick={() => void handleTap()}
        // Never disabled. Loading is aria-busy, not grayed out.
        aria-busy={loading}
        aria-describedby={blockers.length > 0 ? "submit-blockers" : undefined}
        className={cn("min-h-[44px] min-w-[120px]", className)}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span>Working…</span>
          </span>
        ) : (
          children
        )}
      </Button>

      {blockers.length > 0 && (
        <div
          id="submit-blockers"
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1"
        >
          <p className="text-sm font-medium text-destructive">
            {blockers.length === 1
              ? "One thing needs attention:"
              : `${blockers.length} things need attention:`}
          </p>
          <ul className="text-sm text-muted-foreground space-y-0.5">
            {blockers.map((b) => (
              <li key={b.fieldId}>
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => document.getElementById(b.fieldId)?.focus()}
                >
                  {b.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
