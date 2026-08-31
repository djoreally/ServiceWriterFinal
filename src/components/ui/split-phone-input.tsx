import { useRef, useMemo, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

interface SplitPhoneInputProps {
  /** Current value in any format (e.g. "(555) 123-4567", "5551234567", "+15551234567") */
  value: string;
  /** Called with the raw formatted string "555-123-4567" (or partial while typing) */
  onChange: (formatted: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** Show validation error when incomplete after user interaction */
  showValidation?: boolean;
}

function extractDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Strip leading 1 for US numbers when 11 digits
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.slice(0, 10);
}

/**
 * US-only phone input split into three boxes: 3-3-4 digits.
 * Auto-advances on fill, backspaces to previous box when empty,
 * and accepts pasted values in any common format.
 */
export function SplitPhoneInput({
  value,
  onChange,
  id,
  required,
  disabled,
  showValidation,
}: SplitPhoneInputProps) {
  const [touched, setTouched] = useState(false);
  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);
  const ref3 = useRef<HTMLInputElement>(null);

  const digits = useMemo(() => extractDigits(value), [value]);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 10);

  const emit = (d: string) => {
    const p1 = d.slice(0, 3);
    const p2 = d.slice(3, 6);
    const p3 = d.slice(6, 10);
    let out = p1;
    if (p2) out += `-${p2}`;
    if (p3) out += `-${p3}`;
    onChange(out);
  };

  const handlePart = (part: 1 | 2 | 3, raw: string) => {
    const clean = raw.replace(/\D/g, "");
    // If user pastes a long string into any box, treat as full number
    if (clean.length > (part === 3 ? 4 : 3)) {
      const combined = clean.length >= 10 ? clean.slice(-10) : clean;
      emit(combined);
      if (combined.length >= 10) ref3.current?.focus();
      return;
    }

    let next = digits;
    if (part === 1) next = clean + digits.slice(3);
    if (part === 2) next = digits.slice(0, 3) + clean + digits.slice(6);
    if (part === 3) next = digits.slice(0, 6) + clean;
    next = next.slice(0, 10);
    emit(next);

    if (part === 1 && clean.length === 3) ref2.current?.focus();
    if (part === 2 && clean.length === 3) ref3.current?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData?.getData("text") ?? "";
    const clean = pasted.replace(/\D/g, "");
    if (clean.length >= 4) {
      e.preventDefault();
      const combined = clean.length >= 10 ? clean.slice(-10) : clean;
      emit(combined);
      if (combined.length >= 10) ref3.current?.focus();
    }
  };

  const handleKeyDown = (
    part: 1 | 2 | 3,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && e.currentTarget.value === "") {
      if (part === 2) ref1.current?.focus();
      if (part === 3) ref2.current?.focus();
    }
  };

  const isComplete = digits.length === 10;
  const showError = showValidation !== false && touched && !isComplete && digits.length > 0;

  useEffect(() => {
    if (showValidation === true && !isComplete) void Promise.resolve().then(() => setTouched(true));
  }, [showValidation, isComplete]);

  const boxClass = cn(
    "text-center tabular-nums",
    showError && "border-destructive focus-visible:ring-destructive",
  );

  const handleWrapperBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Only mark touched when focus leaves the wrapper entirely,
    // not when auto-advancing between the 3 boxes.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setTouched(true);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2" onBlur={handleWrapperBlur}>
        <Input
          ref={ref1}
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-area-code"
          aria-label="Phone area code"
          maxLength={3}
          value={part1}
          onChange={(e) => handlePart(1, e.target.value)}
          onKeyDown={(e) => handleKeyDown(1, e)}
          onPaste={handlePaste}
          placeholder="555"
          disabled={disabled}
          required={required}
          className={cn(boxClass, "w-16")}
        />
        <span aria-hidden className="text-muted-foreground">-</span>
        <Input
          ref={ref2}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          aria-label="Phone prefix"
          maxLength={3}
          value={part2}
          onChange={(e) => handlePart(2, e.target.value)}
          onKeyDown={(e) => handleKeyDown(2, e)}
          onPaste={handlePaste}
          placeholder="123"
          disabled={disabled}
          className={cn(boxClass, "w-16")}
        />
        <span aria-hidden className="text-muted-foreground">-</span>
        <Input
          ref={ref3}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-local"
          aria-label="Phone line number"
          maxLength={4}
          value={part3}
          onChange={(e) => handlePart(3, e.target.value)}
          onKeyDown={(e) => handleKeyDown(3, e)}
          onPaste={handlePaste}
          placeholder="4567"
          disabled={disabled}
          className={cn(boxClass, "w-20")}
        />
      </div>
      {showError && (
        <p
          role="alert"
          className="mt-1 flex items-center gap-1 text-xs text-destructive"
        >
          <AlertCircle className="h-3 w-3" />
          Please enter a full 10-digit US phone number.
        </p>
      )}
    </div>
  );
}
