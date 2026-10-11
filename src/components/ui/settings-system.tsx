import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RotateCcw, AlertTriangle } from "lucide-react";

/**
 * Settings is a system. Match the model to the blast radius.
 *
 * BLAST RADIUS:
 * - Harmless (toggle supply): instant. Flip, done.
 * - Identity fields: save bar + cancel.
 * - Destructive (deletes everything): quarantine at the bottom.
 *
 * ORGANIZATION:
 * - 40 settings in one list reads like a phone book. Group by task.
 * - Advanced hides behind one click.
 * - Power users never scroll: one input finds any setting buried
 *   three levels deep. Highlight the match, show the path.
 *
 * CHANGE TRACKING:
 * - Every changed setting shows a dot + reset.
 * - Users experiment when undo is one click away.
 *
 * QUARANTINE:
 * - Destructive actions live in quarantine: red border, bottom of page.
 * - Deleting means typing the name first. Button stays dead until match.
 */

export interface SettingEntry {
  id: string;
  label: string;
  keywords: string[];
  section: string;
  path: string[];
}

interface SettingsSearchProps {
  settings: SettingEntry[];
  onNavigate: (id: string) => void;
  className?: string;
}

export function SettingsSearch({ settings, onNavigate, className }: SettingsSearchProps) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return settings
      .filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          s.keywords.some((k) => k.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [query, settings]);

  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-primary/20 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search settings…"
        className="pl-9 min-h-[44px]"
        aria-label="Search settings"
      />
      {matches.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border bg-card shadow-lg overflow-hidden">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onNavigate(m.id);
                setQuery("");
              }}
              className="w-full px-4 py-3 text-left hover:bg-muted/50 active:bg-muted"
            >
              <p className="text-sm font-medium">{highlight(m.label)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {m.path.join(" › ")}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ChangeDotProps {
  changed: boolean;
  onReset: () => void;
  className?: string;
}

/** VS Code marks every override. So do we: dot + one-click reset. */
export function ChangeDot({ changed, onReset, className }: ChangeDotProps) {
  if (!changed) return null;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="h-2 w-2 rounded-full bg-primary" aria-label="Changed" />
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        aria-label="Reset to saved value"
      >
        <RotateCcw className="h-3 w-3" />
        Reset
      </button>
    </span>
  );
}

interface QuarantineZoneProps {
  title: string;
  description: string;
  /** The exact name the user must type to confirm. */
  confirmName: string;
  confirmLabel?: string;
  destructiveLabel: string;
  onDestroy: () => Promise<void> | void;
  children?: React.ReactNode;
}

/**
 * Destructive actions live in quarantine.
 * Red border, bottom of the page. Type the name to arm the button.
 */
export function QuarantineZone({
  title,
  description,
  confirmName,
  confirmLabel = `Type "${confirmName}" to confirm`,
  destructiveLabel,
  onDestroy,
  children,
}: QuarantineZoneProps) {
  const [typed, setTyped] = useState("");
  const [destroying, setDestroying] = useState(false);
  const matches = typed.trim() === confirmName;

  const handleDestroy = async () => {
    if (!matches || destroying) return;
    setDestroying(true);
    try {
      await onDestroy();
    } finally {
      setDestroying(false);
    }
  };

  return (
    <section
      aria-label={title}
      className="rounded-lg border-2 border-destructive/40 p-6 space-y-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-destructive">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {children}

      <div className="space-y-3 pt-2">
        <label className="block">
          <span className="text-sm font-medium">{confirmLabel}</span>
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={confirmName}
            className="mt-1.5 min-h-[44px] font-mono"
            autoComplete="off"
          />
        </label>
        <Button
          variant="destructive"
          disabled={!matches || destroying}
          onClick={() => void handleDestroy()}
          className="min-h-[44px] w-full sm:w-auto"
        >
          {destroying ? "Working…" : destructiveLabel}
        </Button>
        {!matches && typed.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Keep typing — the button arms when the name matches exactly.
          </p>
        )}
      </div>
    </section>
  );
}
