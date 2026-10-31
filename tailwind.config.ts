import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      gridTemplateColumns: {
        "week-7": "48px repeat(7, 1fr)",
      },
      // Motion doctrine: interactive state changes stay <=180ms on the
      // standard curve; 'fast' for micro-states, 'slow' reserved for sheet-level
      // transforms. Reduced-motion users get ~0ms via the global CSS guard.
      transitionDuration: {
        fast: "120ms",
        normal: "180ms",
        slow: "240ms",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
        emphasized: "cubic-bezier(0.3, 0, 0.2, 1)",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        "primary-container": "hsl(var(--primary-container))",
        "primary-container-soft": "hsl(var(--primary-container-soft))",
        "on-primary-container": "hsl(var(--on-primary-container))",
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Financial System
        revenue: {
          positive: {
            DEFAULT: "hsl(var(--revenue-positive-bg))",
            fg: "hsl(var(--revenue-positive-text))",
            border: "hsl(var(--revenue-positive-border))",
          },
          neutral: {
            DEFAULT: "hsl(var(--revenue-neutral-bg))",
            fg: "hsl(var(--revenue-neutral-text))",
          },
          negative: {
            DEFAULT: "hsl(var(--revenue-negative-bg))",
            fg: "hsl(var(--revenue-negative-text))",
            accent: "hsl(var(--revenue-negative-accent))",
          },
        },
        // Operational Status
        status: {
          scheduled: {
            DEFAULT: "hsl(var(--status-scheduled-bg))",
            fg: "hsl(var(--status-scheduled-text))",
          },
          inprogress: {
            DEFAULT: "hsl(var(--status-inprogress-bg))",
            fg: "hsl(var(--status-inprogress-text))",
          },
          completed: {
            DEFAULT: "hsl(var(--status-completed-bg))",
            fg: "hsl(var(--status-completed-text))",
          },
          awaiting: {
            DEFAULT: "hsl(var(--status-awaiting-bg))",
            fg: "hsl(var(--status-awaiting-text))",
          },
          "po-pending": {
            DEFAULT: "hsl(var(--status-po-pending-bg))",
            fg: "hsl(var(--status-po-pending-text))",
          },
          "payment-captured": {
            DEFAULT: "hsl(var(--status-payment-captured-bg))",
            fg: "hsl(var(--status-payment-captured-text))",
          },
          "payment-failed": {
            DEFAULT: "hsl(var(--status-payment-failed-bg))",
            fg: "hsl(var(--status-payment-failed-text))",
          },
        },
        // Dispatch & Logistics
        logistics: {
          "van-assigned": "hsl(var(--logistics-van-assigned))",
          "route-optimized": "hsl(var(--logistics-route-optimized))",
          "capacity-warning": "hsl(var(--logistics-capacity-warning))",
          "overbooked": "hsl(var(--logistics-overbooked))",
        },
        // Stripe
        stripe: {
          accent: "hsl(var(--stripe-accent))",
        },
        // Alert System
        alert: {
          info: {
            DEFAULT: "hsl(var(--alert-info-bg))",
            fg: "hsl(var(--alert-info-text))",
          },
          warning: {
            DEFAULT: "hsl(var(--alert-warning-bg))",
            fg: "hsl(var(--alert-warning-text))",
          },
          critical: {
            DEFAULT: "hsl(var(--alert-critical-bg))",
            fg: "hsl(var(--alert-critical-text))",
          },
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        // SocialMetric system (redesign Phase 0): the one dark surface and
        // AA-safe blue text, plus the dashboard module-tile pastels.
        navy: {
          DEFAULT: "#0f172a",
          muted: "#cbd5e1",
        },
        "blue-strong": "#0f5fd8",
        tile: {
          blue: "#e1ebfd",
          green: "#e2f5e9",
          pink: "#fde8ef",
          purple: "#ede9fe",
          orange: "#fff1e0",
        },
        // Attention values (KPIs, "needs attention") — WCAG AA on both themes.
        attention: {
          fg: "hsl(var(--attention-fg))",
        },
        // Data-visualization palette — the ONLY non-semantic categorical hues.
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          "trend-up": "hsl(var(--chart-trend-up))",
          "trend-down": "hsl(var(--chart-trend-down))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      inset: {
        // Named chrome offsets — replaces ad-hoc calc() arbitrary values.
        "sidebar-offset": "calc(15rem + 1rem)", // w-60 sidebar + gap, lg chrome
        "above-mobile-nav": "calc(var(--mobile-nav-height) + 0.75rem)",
        "above-mobile-nav-drawer": "calc(var(--mobile-nav-height) + 3.5rem)",
      },
      zIndex: {
        // Overlay governance: chrome and portals own these bands only (rule 15).
        base: "var(--z-base)",
        sticky: "var(--z-sticky)",
        dropdown: "var(--z-dropdown)",
        overlay: "var(--z-overlay)",
        modal: "var(--z-modal)",
        toast: "var(--z-toast)",
        max: "var(--z-max)",
      },
      borderRadius: {
        // Canonical geometry comes from radius.css (single source of truth).
        // rounded = sm (8), then 12 / 16 / 20 / 24 as containers grow
        // (SocialMetric geometry, redesign Phase 0); 3xl is legacy/marketing.
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        "3xl": "var(--radius-3xl)",
      },
      fontFamily: {
        sans: ["Inter Variable", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Plus Jakarta Sans Variable", "Plus Jakarta Sans", "Inter Variable", "Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono Variable", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        // SocialMetric blue-tinted elevation (redesign Phase 0).
        card: "0 8px 22px rgba(29, 78, 124, 0.05)",
        raised: "0 10px 28px rgba(29, 78, 124, 0.07)",
        overlay: "0 18px 45px rgba(28, 82, 140, 0.12)",
        modal: "0 35px 80px rgba(19, 41, 74, 0.26)",
        button: "0 12px 26px rgba(29, 113, 238, 0.24)",
        nav: "12px 0 36px rgba(25, 72, 120, 0.06)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
