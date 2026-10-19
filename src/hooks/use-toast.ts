/**
 * Backwards-compatible adapter over the SINGLE toast system.
 *
 * The canonical notification API is the sonner facade (`@/components/ui/sonner`):
 * one renderer, one history store, dedupe built in. This module keeps the
 * historical shadcn `use-toast` call shape (`toast({ title, description,
 * variant: "destructive" })`) working for legacy call sites while routing every
 * notification through the canonical system. The old radix rendering store is
 * gone — new code should import `toast` from `@/components/ui/sonner`.
 */
import { toast as sonnerToast } from "@/components/ui/sonner";
import { addToastHistoryItem, clearToastHistory, getToastHistory, useToastHistory } from "@/lib/toast-history";

export { addToastHistoryItem, clearToastHistory, getToastHistory, useToastHistory };

type LegacyVariant = "default" | "destructive" | null | undefined;

type LegacyToastOptions = {
  title?: unknown;
  description?: unknown;
  variant?: LegacyVariant;
  action?: unknown;
  duration?: number;
  dedupeKey?: string;
};

const toMessage = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : value != null ? String(value) : fallback;

/**
 * Legacy shadcn call shape. Maps to the canonical facade:
 *   variant: "destructive" → error toast; anything else → default toast.
 * Returns the facade's toast handle.
 */
export function toast({ title, description, variant, dedupeKey }: LegacyToastOptions) {
  const message = toMessage(title, "Notification");
  const body = typeof description === "string" ? description : undefined;
  const options = { description: body, dedupeKey };
  if (variant === "destructive") return sonnerToast.error(message, options);
  return sonnerToast(message, options);
}

/**
 * Legacy hook shape. `toasts` is always empty: rendering is owned by the
 * mounted sonner <Toaster /> (single visual system) and `ui/toaster.tsx` now
 * contributes only the history chip.
 */
export function useToast() {
  return {
    toasts: [] as never[],
    toast,
    dismiss: sonnerToast.dismiss,
  };
}
