/**
 * Enterprise-grade step progress indicator for checkout
 * Boring, familiar, reliable - maximizes conversion
 */

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { memo } from "react";

const CHECKOUT_STEPS = [
  { id: 1, name: "Location" },
  { id: 2, name: "Vehicles" },
  { id: 3, name: "Services" },
  { id: 4, name: "Schedule" },
  { id: 5, name: "Checkout" },
];

interface CheckoutProgressProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
  completedSteps?: number[];
  className?: string;
}

/** ⚡ Memoized — re-renders only when step/completedSteps change, not on every parent render */
export const CheckoutProgress = memo(function CheckoutProgress({ 
  currentStep, 
  onStepClick,
  completedSteps = [],
  className 
}: CheckoutProgressProps) {
  const canNavigateToStep = (stepId: number) => {
    return stepId < currentStep || completedSteps.includes(stepId);
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        {CHECKOUT_STEPS.map((step, idx) => {
          const isCompleted = currentStep > step.id || completedSteps.includes(step.id);
          const isCurrent = currentStep === step.id;
          const canClick = canNavigateToStep(step.id);

          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                type="button"
                onClick={() => canClick && onStepClick?.(step.id)}
                disabled={!canClick}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 text-[10px] font-medium transition-colors sm:flex-row sm:gap-2 sm:text-sm",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  canClick && "cursor-pointer hover:text-blue-600",
                  !canClick && "cursor-default"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-md text-xs font-semibold border-2 transition-all duration-200",
                  isCurrent && "border-blue-600 bg-blue-600 text-white",
                  isCompleted && !isCurrent && "border-blue-600 bg-blue-600 text-white",
                  !isCompleted && !isCurrent && "border-muted-foreground/40 text-muted-foreground"
                )}>
                  {isCompleted && !isCurrent ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.id
                  )}
                </div>
                <span className={cn(
                  "max-w-[54px] truncate sm:max-w-none",
                  isCurrent && "text-foreground",
                  isCompleted && !isCurrent && "text-foreground",
                  !isCompleted && !isCurrent && "text-muted-foreground"
                )}>
                  {step.name}
                </span>
              </button>
              
              {idx < CHECKOUT_STEPS.length - 1 && (
                <div className={cn(
                  "flex-1 h-0.5 mx-1 sm:mx-3 transition-colors duration-200",
                  currentStep > step.id ? "bg-blue-600" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
});
