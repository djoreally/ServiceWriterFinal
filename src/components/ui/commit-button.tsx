import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertCircle } from "lucide-react";

/**
 * CommitButton — lay up the moment it's tapped.
 *
 * - Disables itself INSTANTLY on tap. A slow network never lets you buy twice.
 * - One intent, one request. The handler is guarded in code, not just the UI.
 * - Label swaps for a spinner INSIDE the same button, width locked —
 *   nothing around it jumps. Layout shift reads as broken.
 * - Hands the server a real idempotency key (UUID per intent).
 * - Success: spinner morphs into a check for a full beat before moving on.
 * - Error: snaps back, says why RIGHT THERE on the button.
 * - Re-enables only after the real request resolves. Not on a timer, not on a guess.
 */

type CommitState = "idle" | "pending" | "success" | "error";

interface CommitButtonProps {
  /** The async work. Receives an idempotency key — send it to the server. */
  onCommit: (idempotencyKey: string) => Promise<void>;
  /** Called after the success check has shown for a full beat. */
  onSuccess?: () => void;
  children: React.ReactNode;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  disabled?: boolean;
  /** Testing hook passthrough. */
  "data-testid"?: string;
}

const SUCCESS_BEAT_MS = 1000;

export function CommitButton({
  onCommit,
  onSuccess,
  children,
  variant = "default",
  size = "default",
  className,
  disabled = false,
  "data-testid": testId,
}: CommitButtonProps) {
  const [state, setState] = useState<CommitState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  // Guard the handler directly — disabling the UI is not enough on its own.
  const inFlight = useRef(false);

  const handleTap = async () => {
    if (inFlight.current || state === "pending") return;
    inFlight.current = true;
    setState("pending");
    setErrorMsg("");

    const idempotencyKey = crypto.randomUUID();

    try {
      await onCommit(idempotencyKey);
      setState("success");
      // Full beat on the check before moving the user along.
      await new Promise((r) => setTimeout(r, SUCCESS_BEAT_MS));
      onSuccess?.();
      setState("idle");
    } catch (err) {
      // Snap back. Say why, right there on the button.
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setState("error");
    } finally {
      // Re-enable only after the real request resolves.
      inFlight.current = false;
      if (state !== "success") {
        // Error state: stay on error until next tap, then reset to idle on tap.
      }
    }
  };

  const handleRetryTap = () => {
    if (state === "error") {
      setState("idle");
      setErrorMsg("");
      void handleTap();
    } else {
      void handleTap();
    }
  };

  return (
    <Button
      variant={state === "error" ? "destructive" : variant}
      size={size}
      disabled={disabled || state === "pending" || state === "success"}
      onClick={handleRetryTap}
      data-testid={testId}
      className={cn(
        "min-w-[120px] min-h-[44px] relative",
        state === "error" && "min-w-[200px]",
        className
      )}
    >
      {state === "idle" && children}

      {state === "pending" && (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="opacity-70">Working…</span>
        </span>
      )}

      {state === "success" && (
        <span className="inline-flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>Done</span>
        </span>
      )}

      {state === "error" && (
        <span className="inline-flex items-center gap-2 text-left">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm leading-tight">{errorMsg}</span>
        </span>
      )}
    </Button>
  );
}
