import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export const OnboardingProgress = ({
  currentStep,
  totalSteps,
  stepLabels,
}: OnboardingProgressProps) => {
  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Progress bar */}
      <div className="relative mb-8">
        <div className="absolute top-4 left-0 w-full h-1 bg-muted rounded-md">
          <div
            className="h-full bg-primary rounded-md transition-all duration-500"
            style={{
              width: `${((currentStep) / (totalSteps - 1)) * 100}%`,
            }}
          />
        </div>

        {/* Step indicators */}
        <div className="relative flex justify-between">
          {stepLabels.map((label, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;

            return (
              <div key={index} className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-8 h-8 rounded-md flex items-center justify-center text-sm font-medium transition-all",
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium text-center max-w-[80px] hidden sm:block",
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
