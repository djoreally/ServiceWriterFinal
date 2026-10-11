import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Optimistic UI — you're not buying speed, you're buying the feeling of it.
 *
 * Two like buttons, same network:
 * - Slow: waits for the server before anything moves.
 * - Fast: updates the screen first, syncs in the background.
 * One just stopped waiting.
 *
 * Your brain reads anything under 400ms as instant. Past that, a spinner
 * reads as broken — even when it works fine.
 *
 * On failure the fast one ROLLS BACK. The like undoes itself, the count
 * returns to where it was. Optimistic isn't ignoring errors. It's betting
 * on success — 99% of the time it was right anyway.
 *
 * NEVER fake a payment, a transfer, or anything you can't undo.
 * Show those the truth, even if the truth is a spinner.
 * (Use CommitButton for those.)
 */

interface UseOptimisticProps<T> {
  /** The async work. Throw on failure to trigger rollback. */
  commit: (next: T) => Promise<void>;
  /** Called with the failure — show it honestly, don't swallow. */
  onError?: (error: Error, rolledBackTo: T) => void;
}

export function useOptimistic<T>({ commit, onError }: UseOptimisticProps<T>) {
  const [value, setValue] = useState<T | null>(null);
  const [pending, setPending] = useState(false);
  const committedRef = useRef<T | null>(null);
  const inFlight = useRef(false);

  const set = (next: T) => {
    // First call establishes the baseline.
    if (committedRef.current === null && value === null) {
      committedRef.current = next;
      setValue(next);
      return;
    }
    setValue(next);
  };

  const flush = async (optimisticValue: T) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);

    // Update the screen FIRST.
    const previous = committedRef.current;
    setValue(optimisticValue);

    try {
      await commit(optimisticValue);
      committedRef.current = optimisticValue;
    } catch (err) {
      // Roll back. The like undoes itself.
      setValue(previous);
      committedRef.current = previous;
      const error = err instanceof Error ? err : new Error("Couldn't save. Rolled back.");
      onError?.(error, previous as T);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return { value, set, flush, pending };
}

interface OptimisticToggleProps {
  pressed: boolean;
  onToggle: (next: boolean) => Promise<void>;
  onError?: (error: Error) => void;
  children: (pressed: boolean, pending: boolean) => React.ReactNode;
  className?: string;
  label: string;
}

/**
 * A toggle that feels instant. Updates first, syncs after, rolls back on failure.
 * For likes, stars, follows — anything undoable. Never for payments.
 */
export function OptimisticToggle({
  pressed: initial,
  onToggle,
  onError,
  children,
  className,
  label,
}: OptimisticToggleProps) {
  const [pressed, setPressed] = useState(initial);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const handleTap = async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    const next = !pressed;
    const prev = pressed;

    // Screen updates NOW — under 400ms reads as instant.
    setPressed(next);
    setPending(true);

    try {
      await onToggle(next);
    } catch (err) {
      // Roll back. Count returns to where it was.
      setPressed(prev);
      onError?.(err instanceof Error ? err : new Error("Couldn't save."));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleTap()}
      aria-pressed={pressed}
      aria-label={label}
      className={cn("min-h-[44px] min-w-[44px]", className)}
    >
      {children(pressed, pending)}
    </button>
  );
}
