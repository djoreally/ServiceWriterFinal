import { useEffect, useState } from "react";
import { ThemeProviderContext, type Theme } from "@/contexts/ThemeContext";
import { supabase } from "@/integrations/supabase/client";

const getResolvedTheme = (theme: Theme) => {
  if (typeof window === "undefined") return theme === "dark" ? "dark" : "light";
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  if (theme === "auto") {
    const hour = new Date().getHours();
    return hour >= 19 || hour < 7 ? "dark" : "light";
  }
  if (theme === "high-contrast") return "dark";
  return theme;
};

const isTheme = (value: string | null): value is Theme =>
  value === "light" || value === "dark" || value === "system" || value === "auto" || value === "high-contrast";

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [accountStorageKey, setAccountStorageKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const applyAccount = (userId: string | null) => {
      if (!active) return;
      if (!userId) {
        setAccountStorageKey(null);
        setThemeState(defaultTheme);
        return;
      }

      const key = `${storageKey}:${userId}`;
      setAccountStorageKey(key);
      try {
        const stored = window.localStorage.getItem(key);
        setThemeState(isTheme(stored) ? stored : defaultTheme);
      } catch {
        setThemeState(defaultTheme);
      }
    };

    void supabase.auth.getSession().then(({ data }) => applyAccount(data.session?.user.id ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applyAccount(session?.user.id ?? null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [defaultTheme, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = window.document.documentElement;

    const applyTheme = () => {
      root.classList.remove("light", "dark", "high-contrast");
      root.classList.add(getResolvedTheme(theme));
      root.classList.toggle("high-contrast", theme === "high-contrast");
    };

    applyTheme();

    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", applyTheme);
      return () => media.removeEventListener("change", applyTheme);
    }

    if (theme === "auto") {
      const interval = window.setInterval(applyTheme, 60 * 1000);
      return () => window.clearInterval(interval);
    }
  }, [theme]);

  const value = {
    theme,
    setTheme: (nextTheme: Theme) => {
      if (typeof window !== "undefined" && accountStorageKey) {
        try {
          window.localStorage.setItem(accountStorageKey, nextTheme);
        } catch {
          // Browser storage is optional; the active session still receives the change.
        }
      }
      setThemeState(nextTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
