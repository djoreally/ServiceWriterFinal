import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[background-color,color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground shadow-sm hover:bg-[hsl(var(--primary-hover))] active:bg-[hsl(var(--primary-pressed))]",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
      outline: "border border-input bg-background hover:border-primary/30 hover:bg-[hsl(var(--primary-container-soft))] hover:text-[hsl(var(--on-primary-container))]",
      secondary: "bg-secondary text-secondary-foreground hover:bg-[hsl(var(--primary-container))] hover:text-[hsl(var(--on-primary-container))]",
      ghost: "hover:bg-[hsl(var(--primary-container))] hover:text-[hsl(var(--on-primary-container))]",
      link: "text-[hsl(var(--action-text))] underline-offset-4 hover:text-[hsl(var(--primary-hover))] hover:underline",
    },
    size: {
      xs: "h-8 rounded-md px-2.5 text-xs",
      default: "h-11 px-4 sm:h-10",
      sm: "h-10 rounded-md px-3 sm:h-9",
      lg: "h-12 rounded-md px-6 sm:h-11",
      iconXs: "h-8 w-8",
      icon: "h-11 w-11 sm:h-10 sm:w-10",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});

Button.displayName = "Button";

export { Button, buttonVariants };
