import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";

/**
 * InlineEdit — inline editing is a system.
 *
 * - Click the title: it's an input now. NOTHING MOVED.
 *   Same font, same size, same padding, border transparent.
 *   One pixel jumps and the illusion collapses.
 * - Editable text whispers it: pencil on hover, soft background tint.
 *   No signal and users file tickets to change a title.
 * - Enter commits. Escape cancels. Blur: pick ONE rule and never break it.
 *   (This component saves on blur, like Notion. Spreadsheets discard.)
 * - Optimistic: text updates on screen while the request flies.
 *   Server fails → roll back, keep the draft, say why.
 * - Match the mode to the cost of a typo. Airtable makes every cell
 *   editable; Docs makes you ask. More power means more accidents.
 */

interface InlineEditProps {
  value: string;
  onSave: (next: string) => Promise<void>;
  /** Placeholder when empty. */
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** aria-label for the input. */
  label: string;
}

export function InlineEdit({
  value,
  onSave,
  placeholder = "Click to edit",
  className,
  inputClassName,
  label,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCommitted = useRef(value);

  // Keep in sync if the parent value changes externally.
  useEffect(() => {
    if (!editing) {
      setDraft(value);
      lastCommitted.current = value;
    }
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    setEditing(false);
    setError(null);

    // No change — nothing to save.
    if (next === lastCommitted.current) return;

    // Optimistic: update the screen now.
    lastCommitted.current = next;
    setSaving(true);
    try {
      await onSave(next);
    } catch (err) {
      // Roll back, keep the draft, say why.
      lastCommitted.current = value;
      setDraft(next);
      setError(err instanceof Error ? err.message : "Couldn't save. Your text is kept below.");
      setEditing(true);
      return;
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(lastCommitted.current);
    setEditing(false);
    setError(null);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${label}: ${value || placeholder}`}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded px-1 -mx-1 text-left",
          "hover:bg-muted/60 transition-colors",
          !value && "text-muted-foreground",
          className
        )}
      >
        <span className={cn(saving && "opacity-60")}>{value || placeholder}</span>
        <Pencil
          className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          aria-hidden
        />
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => void commit()}
        aria-label={label}
        placeholder={placeholder}
        disabled={saving}
        className={cn(
          // Pixel-stable: inherit the surrounding text styles.
          // Parent controls font/size/padding — the input matches exactly.
          "bg-transparent border border-transparent rounded px-1 -mx-1",
          "focus:border-primary focus:bg-card focus:outline-none",
          "disabled:opacity-60",
          "w-full min-w-[120px]",
          inputClassName,
          className
        )}
      />
      {error && (
        <span role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
