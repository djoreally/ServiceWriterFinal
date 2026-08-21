/**
 * OilResetProcedureCard — oil-life-monitor reset steps for the vehicle in hand.
 * Internal/technician facing only.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw } from "lucide-react";
import { useOilResetProcedure } from "@/application/queries/vehicle-filters.query";

interface OilResetProcedureCardProps {
  year: number | null | undefined;
  make: string | null | undefined;
  model: string | null | undefined;
  className?: string;
  /** Category policy gate — tire/detailing categories never show fluid data. */
  showFluidSpecs?: boolean;
}

export function OilResetProcedureCard({ year, make, model, className, showFluidSpecs = true }: OilResetProcedureCardProps) {
  const { data, isLoading } = useOilResetProcedure({ year, make, model });

  if (!showFluidSpecs) return null;
  if (!year || !make || !model) return null;
  if (!isLoading && !data) return null;


  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <RotateCcw className="h-4 w-4 text-muted-foreground" />
          Oil Life Reset
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading ? (
          <>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </>
        ) : (
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            {data!.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default OilResetProcedureCard;
