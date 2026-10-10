import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./typography.css";

/**
 * Text — the typography system as a component.
 * Seven decisions, one font, reads like a product.
 */

type TextSize = "xs" | "sm" | "md" | "lg" | "xl";
type TextColor = "primary" | "secondary" | "muted";
type TextWeight = "regular" | "semibold";

interface TextProps {
  size?: TextSize;
  color?: TextColor;
  weight?: TextWeight;
  /** Cap measure at 65ch for body text. */
  measure?: boolean;
  /** Tabular figures for numbers. */
  tabular?: boolean;
  className?: string;
  children: ReactNode;
}

const sizeClass: Record<TextSize, string> = {
  xs: "type-xs",
  sm: "type-sm",
  md: "type-md",
  lg: "type-lg",
  xl: "type-xl",
};

const colorClass: Record<TextColor, string> = {
  primary: "type-primary",
  secondary: "type-secondary",
  muted: "type-mut-soft",
};

const weightClass: Record<TextWeight, string> = {
  regular: "type-regular",
  semibold: "type-semibold",
};

export function Text({
  size = "sm",
  color = "primary",
  weight = "regular",
  measure = false,
  tabular = false,
  className,
  children,
}: TextProps) {
  return (
    <span
      className={cn(
        sizeClass[size],
        colorClass[color],
        weightClass[weight],
        measure && "type-measure",
        tabular && "type-tabular",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Small uppercase label — opens up +5% tracking. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("type-label", className)}>{children}</span>;
}

/** Page heading — 32px, tight leading, -2% tracking. */
export function Heading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn("type-xl type-semibold", className)}>{children}</h1>
  );
}

/** Section heading — 25px, tight leading, -2% tracking. */
export function Subheading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("type-lg type-semibold", className)}>{children}</h2>
  );
}
