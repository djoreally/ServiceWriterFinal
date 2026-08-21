import { Input } from "@/components/ui/input";

interface IconInputProps {
  id: string;
  icon: React.ElementType;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  disabled?: boolean;
  rightSlot?: React.ReactNode;
}

/**
 * Input with a leading icon on the left.
 * Used by auth and other public-facing forms.
 */
export function IconInput({
  id,
  icon: Icon,
  type = "text",
  placeholder,
  value,
  onChange,
  required,
  disabled,
  rightSlot,
}: IconInputProps) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
        <Icon className="h-4 w-4" />
      </span>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className="pl-10 pr-4 h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-400 transition-colors"
      />
      {rightSlot && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</span>
      )}
    </div>
  );
}
