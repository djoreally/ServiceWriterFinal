import { cn } from "@/lib/utils";

/**
 * View switcher (redesign design system §3.1 / Batch 2 spec component):
 * fixed segments on a surface-soft track; the selected segment is the blue
 * primary fill with white text. Every option stays visible and one tap away
 * — this replaces the old overlapping tab strip pattern for good.
 */
export function ViewSegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-1 rounded-xl bg-secondary p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 rounded-lg px-3 py-2 text-sm font-bold transition-colors",
              selected ? "bg-primary-action text-primary-foreground shadow-button" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
