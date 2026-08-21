import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const DashboardSkeleton = () => (
  <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
    <div className="grid gap-4 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Skeleton className="h-80 rounded-xl lg:col-span-2" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  </div>
);

export const TableSkeleton = ({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) => (
  <Card aria-busy="true" aria-label="Loading table">
    <CardHeader><Skeleton className="h-8 w-48" /></CardHeader>
    <CardContent className="space-y-3">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, column) => <Skeleton key={column} className="h-9 rounded-md" />)}
        </div>
      ))}
    </CardContent>
  </Card>
);
