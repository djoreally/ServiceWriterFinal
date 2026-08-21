import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const AnimatedChartFrame = ({ children, animationKey, className }: { children: ReactNode; animationKey: string | number; className?: string }) => (
  <div key={animationKey} className={cn("animate-in fade-in-0 slide-in-from-bottom-2 duration-500", className)}>
    {children}
  </div>
);
