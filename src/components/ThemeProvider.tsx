
import { useEffect, useState } from "react";
import { ThemeProviderContext, type Theme } from "@/contexts/ThemeContext";

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

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    try {
      return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = window.document.documentElement;

    root.classList.remove("light", "dark", "high-contrast");

    const applyTheme = () => {
      root.classList.remove("light", "dark");
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
    setTheme: (theme: Theme) => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, theme);
        } catch {
          // ignore storage errors
        }
      }
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
