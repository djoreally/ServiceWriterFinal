import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> { density?: "compact" | "comfortable" }
const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, density = "comfortable", ...props }, ref) => <input type={type} className={cn("flex w-full rounded-md border border-input bg-background px-3 ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70", density === "compact" ? "h-9 py-1.5 text-sm" : "h-12 py-2 text-base md:h-10 md:text-sm", className)} ref={ref} {...props} />);
Input.displayName = "Input";
export { Input };
