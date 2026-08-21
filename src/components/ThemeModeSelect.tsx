import { Contrast, Monitor, Moon, Sun, Timer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/contexts/ThemeContext";

const THEME_OPTIONS: Array<{ value: Theme; label: string; description: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", description: "Bright interface", icon: Sun },
  { value: "dark", label: "Dark", description: "Low-light interface", icon: Moon },
  { value: "system", label: "System", description: "Match device preference", icon: Monitor },
  { value: "auto", label: "Auto", description: "Dark at night, light by day", icon: Timer },
  { value: "high-contrast", label: "High contrast", description: "Accessibility-first contrast", icon: Contrast },
];

export function ThemeModeSelect({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const selected = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[2];
  const SelectedIcon = selected.icon;

  return (
    <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
      <SelectTrigger className={compact ? "h-9 w-40" : "w-full"} aria-label="Theme mode">
        <div className="flex items-center gap-2 truncate">
          <SelectedIcon className="h-4 w-4" />
          <SelectValue placeholder="Theme" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="flex flex-col">
                  <span>{option.label}</span>
                  {!compact && <span className="text-xs text-muted-foreground">{option.description}</span>}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
