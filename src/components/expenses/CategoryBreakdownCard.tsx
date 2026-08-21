import { Card, CardContent } from "@/components/ui/card";
import { Tag } from "lucide-react";

interface CategoryBreakdown {
  name: string;
  amount: number;
  percentage: number;
}

interface CategoryBreakdownCardProps {
  breakdown: CategoryBreakdown[];
  total: number;
}

export function CategoryBreakdownCard({ breakdown, total }: CategoryBreakdownCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">By Category</p>
            <h3 className="text-2xl font-black mt-1">${total.toFixed(2)}</h3>
          </div>
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Tag className="h-5 w-5 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          {breakdown.length === 0 && (
            <p className="text-xs text-muted-foreground">No expenses yet this month.</p>
          )}
          {breakdown.slice(0, 6).map((b) => (
            <div key={b.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium truncate">{b.name}</span>
                <span className="text-muted-foreground">${b.amount.toFixed(2)}</span>
              </div>
              <div className="h-1.5 w-full rounded-md bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, b.percentage)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
