import * as React from "react";
import { cn } from "@/lib/utils";

type CardDensity = "compact" | "standard" | "comfortable";
type CardTone = "primary" | "secondary" | "tertiary";
const CardContext = React.createContext<CardDensity>("standard");

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  density?: CardDensity;
  tone?: CardTone;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, density = "standard", tone = "primary", ...props }, ref) => (
  <CardContext.Provider value={density}>
    <div ref={ref} data-density={density} className={cn("rounded-lg border text-card-foreground", tone === "primary" && "bg-card shadow-sm", tone === "secondary" && "bg-muted/20 shadow-none", tone === "tertiary" && "border-transparent bg-transparent shadow-none", className)} {...props} />
  </CardContext.Provider>
));
Card.displayName = "Card";

const densityPadding = { compact: "p-3", standard: "p-4 sm:p-5", comfortable: "p-5 sm:p-6" };
const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const density = React.useContext(CardContext);
  return <div ref={ref} className={cn("flex flex-col space-y-1", densityPadding[density], className)} {...props} />;
});
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => <h3 ref={ref} className={cn("text-base font-semibold leading-snug tracking-tight", className)} {...props} />);
CardTitle.displayName = "CardTitle";
const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const density = React.useContext(CardContext);
  return <div ref={ref} className={cn(densityPadding[density], "pt-0", className)} {...props} />;
});
CardContent.displayName = "CardContent";
const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const density = React.useContext(CardContext);
  return <div ref={ref} className={cn("flex items-center", densityPadding[density], "pt-0", className)} {...props} />;
});
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
