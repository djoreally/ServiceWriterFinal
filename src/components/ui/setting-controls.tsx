import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * Settings controls — one question per control: does it act NOW or on SAVE?
 *
 * - InstantSwitch: acts the moment you flip it. No save button. Ever.
 * - StagedCheckbox: means nothing until the user presses save.
 * - Never mix them in one form without making the semantics obvious.
 *
 * Every control: the whole row is the tap target, minimum 44px tall.
 * A 16px box alone gets missed by every thumb.
 */

interface SettingRowProps {
  label: string;
  description?: string;
  control: ReactNode;
  onToggle?: () => void;
  className?: string;
}

/** Whole-row tap target, 44px minimum. */
export function SettingRow({ label, description, control, onToggle, className }: SettingRowProps) {
  return (
    <div
      onClick={onToggle}
      className={cn(
        "flex items-center justify-between gap-4 min-h-[44px] py-2 cursor-pointer",
        onToggle && "active:bg-muted/50 -mx-2 px-2 rounded-lg",
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {control}
      </div>
    </div>
  );
}

interface InstantSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  /** Called immediately on flip. Must persist without a save button. */
  onFlip: (checked: boolean) => Promise<void> | void;
  disabled?: boolean;
}

/**
 * A switch acts the moment you flip it. No save button behind it. Ever.
 * If the setting needs staging, use StagedCheckbox instead.
 */
export function InstantSwitch({ label, description, checked, onFlip, disabled }: InstantSwitchProps) {
  const [pending, setPending] = useState(false);

  const handleFlip = async () => {
    if (pending || disabled) return;
    setPending(true);
    try {
      await onFlip(!checked);
    } finally {
      setPending(false);
    }
  };

  return (
    <SettingRow
      label={label}
      description={description}
      onToggle={handleFlip}
      control={
        <Switch
          checked={checked}
          disabled={disabled || pending}
          aria-label={label}
        />
      }
    />
  );
}

interface StagedCheckboxProps {
  label: string;
  description?: string;
  checked: boolean;
  /** Stages the change. Parent form's save button persists it. */
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * A checkbox waits. It means nothing until the user presses save.
 * Never use a checkbox for an instant action — that's a switch's job.
 */
export function StagedCheckbox({ label, description, checked, onChange, disabled }: StagedCheckboxProps) {
  return (
    <SettingRow
      label={label}
      description={description}
      onToggle={() => !disabled && onChange(!checked)}
      control={
        <Checkbox
          checked={checked}
          disabled={disabled}
          aria-label={label}
          className="h-5 w-5"
        />
      }
    />
  );
}

type TriState = true | false | "mixed";

interface TriStateCheckboxProps {
  label: string;
  description?: string;
  state: TriState;
  /**
   * Click behavior: checked -> unchecks all, empty -> checks all,
   * mixed (dash) -> checks all. The dash never means "empty".
   */
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

/**
 * A parent checkbox has THREE states, not two.
 * All children on: checked. None on: empty. Mix: dash.
 * Click the dash and every child turns on.
 */
export function TriStateCheckbox({ label, description, state, onChange, disabled }: TriStateCheckboxProps) {
  const isMixed = state === "mixed";
  const isChecked = state === true;

  return (
    <SettingRow
      label={label}
      description={description}
      onToggle={() => !disabled && onChange(!isChecked)}
      control={
        <div className="relative">
          <Checkbox
            checked={isMixed ? "indeterminate" : isChecked}
            disabled={disabled}
            aria-label={label}
            className="h-5 w-5"
          />
        </div>
      }
    />
  );
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Rendered right of the label — e.g. a ChangeDot. */
  trailing?: ReactNode;
}

/**
 * 2-4 exclusive options that must stay in view.
 * Side by side, one tap switches, every option stays one tap away.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  trailing,
}: SegmentedControlProps<T>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        {trailing}
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-1 rounded-lg border bg-muted/30 p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={value === opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "min-h-[44px] rounded-md px-3 py-2 text-sm font-medium transition-colors",
              value === opt.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface RadioListProps<T extends string> {
  label: string;
  options: { value: T; label: string; description?: string }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Pick one of up to 5. All visible, no click to reveal.
 * Past 5, use a dropdown — the list pushes everything else off screen.
 */
export function RadioList<T extends string>({
  label,
  options,
  value,
  onChange,
}: RadioListProps<T>) {
  if (options.length > 5) {
    throw new Error(
      `RadioList supports up to 5 options (${options.length} given). Use a dropdown instead.`
    );
  }

  return (
    <div className="space-y-1" role="radiogroup" aria-label={label}>
      <p className="text-sm font-medium mb-2">{label}</p>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "w-full flex items-center gap-3 min-h-[44px] px-2 py-2 rounded-lg text-left",
            "active:bg-muted/50",
            value === opt.value && "bg-muted/30"
          )}
        >
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
              value === opt.value ? "border-primary" : "border-muted-foreground/40"
            )}
          >
            {value === opt.value && (
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </span>
          <span className="flex-1">
            <span className="text-sm font-medium block">{opt.label}</span>
            {opt.description && (
              <span className="text-xs text-muted-foreground block">{opt.description}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
