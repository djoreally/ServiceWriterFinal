import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

/**
 * Success is a system, not a button.
 *
 * Five decisions, one success state:
 * 1. WHAT happened — specifics are proof. "Invoice sent to Northwind Labs,
 *    due October 12th." Vague "Success" feels like a maybe.
 * 2. WHAT'S NEXT — every success offers the next action. A checkmark with
 *    no button is a dead end; the user closes the tab right there.
 * 3. HOW LONG it stays — dismissal follows stakes. Safe setting: toast,
 *    gone in 4 seconds. Payment: page that stays, with receipt and email.
 *    Nobody screenshots a toast.
 * 4. THE OPEN LOOP — success is not the end. Leave one thread to pull:
 *    track the payment, share the report, invite the team.
 * 5. HOW MUCH celebration — scales with rarity. Confetti on every save
 *    trains people to ignore it. Save it for the first invoice paid.
 *
 * Stakes:
 * - "low": toast, 4s, no celebration. Settings saved, copied, etc.
 * - "high": persistent screen, specifics, next actions, receipt.
 *    Payments, invoices sent, bookings confirmed.
 * - "milestone": high + celebration. First invoice paid, first booking.
 *    Rare joy lands. Constant joy is noise.
 */

export type SuccessStakes = "low" | "high" | "milestone";

export interface SuccessAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost";
}

export interface SuccessOpenLoop {
  label: string;
  description: string;
  onClick: () => void;
}

interface SuccessScreenProps {
  /** What happened — specific. "Invoice sent to Northwind Labs, due October 12th." */
  headline: string;
  /** Supporting detail — receipt info, email sent, amounts. */
  detail?: string;
  /** Next actions — at least one. "View it", "Send another". */
  actions: SuccessAction[];
  /** The thread to pull — keeps the user moving. */
  openLoop?: SuccessOpenLoop;
  /** Rare milestones only. */
  celebrate?: boolean;
  className?: string;
}

export function SuccessScreen({
  headline,
  detail,
  actions,
  openLoop,
  celebrate = false,
  className,
}: SuccessScreenProps) {
  if (actions.length === 0) {
    throw new Error(
      "SuccessScreen requires at least one next action. A checkmark with no button is a dead end."
    );
  }

  return (
    <div className={cn("flex flex-col items-center text-center px-6 py-12", className)}>
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full",
          celebrate ? "bg-primary/15" : "bg-emerald-500/15"
        )}
      >
        <CheckCircle2
          className={cn("h-8 w-8", celebrate ? "text-primary" : "text-emerald-500")}
        />
      </div>

      <h2 className="mt-6 text-2xl font-semibold tracking-tight max-w-md">
        {headline}
      </h2>

      {detail && (
        <p className="mt-2 text-sm text-muted-foreground max-w-md">{detail}</p>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant ?? "default"}
            onClick={action.onClick}
            className="min-h-[44px]"
          >
            {action.label}
          </Button>
        ))}
      </div>

      {openLoop && (
        <button
          type="button"
          onClick={openLoop.onClick}
          className="mt-8 w-full max-w-md rounded-lg border p-4 text-left hover:bg-muted/30 active:bg-muted/50"
        >
          <p className="text-sm font-medium">{openLoop.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {openLoop.description}
          </p>
        </button>
      )}
    </div>
  );
}

/**
 * Low-stakes success: toast that leaves in 4 seconds.
 * Settings saved, copied to clipboard, toggled.
 * The message still says WHAT happened — "Notifications on", not "Success".
 */
export function successToast(message: string) {
  // Dynamic import to avoid pulling toast into every bundle
  import("sonner").then(({ toast }) => {
    toast.success(message, { duration: 4000 });
  });
}

/**
 * Pick the success pattern by stakes. Enforces the system:
 * - low: toast (4s), specifics required
 * - high/milestone: caller renders <SuccessScreen> with actions
 */
export function reportSuccess(opts: {
  stakes: SuccessStakes;
  /** Specific. "Invoice sent to Northwind Labs, due October 12th." */
  message: string;
}): void {
  if (!opts.message || opts.message.toLowerCase() === "success") {
    throw new Error(
      'Success message must say what happened. "Success" tells you nothing.'
    );
  }

  if (opts.stakes === "low") {
    successToast(opts.message);
    return;
  }

  // high/milestone: the caller must render <SuccessScreen>.
  // This is intentional — a payment deserves a page, not a toast.
  throw new Error(
    `Stakes "${opts.stakes}" requires <SuccessScreen> with next actions. ` +
      `Nobody screenshots a toast.`
  );
}
