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
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
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
