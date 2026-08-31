import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Target, AlertTriangle } from "lucide-react";
import { startOfMonth, addMonths, getDate, getDaysInMonth } from "date-fns";

import {
  fetchRecurringExpenses,
  type RecurringExpenseRow,
} from "@/application/queries/recurring-expenses.query";
import {
  fetchExpenses,
  fetchExpenseCategories,
  type ExpenseRow,
} from "@/application/queries/expenses.query";

interface Props {
  ownerUserId: string | null;
}

function monthlyEquivalent(r: RecurringExpenseRow): number {
  const a = Number(r.amount);
  switch (r.frequency) {
    case "weekly": return (a * 52) / 12;
    case "biweekly": return (a * 26) / 12;
    case "monthly": return a;
    case "quarterly": return a / 3;
    case "yearly": return a / 12;
    default: return a;
  }
}

interface Row {
  category: string;
  projected: number;
  actual: number;
}

export function BudgetForecastTab({ ownerUserId }: Props) {
  const [loading, setLoading] = useState(true);
  const [recurring, setRecurring] = useState<RecurringExpenseRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!ownerUserId) { setLoading(false); return; }
    setLoading(true);
    try {
      const monthStart = startOfMonth(new Date()).toISOString().slice(0, 10);
      const nextMonthStart = addMonths(startOfMonth(new Date()), 1).toISOString().slice(0, 10);
      const [{ data: recs }, { data: exps }, { data: cats }] = await Promise.all([
        fetchRecurringExpenses(ownerUserId),
        fetchExpenses(ownerUserId, monthStart, nextMonthStart),
        fetchExpenseCategories(ownerUserId),
      ]);
      setRecurring((recs as unknown as RecurringExpenseRow[]) ?? []);
      setExpenses((exps as ExpenseRow[]) ?? []);
      const map: Record<string, string> = {};
      (cats ?? []).forEach((c) => { map[c.id] = c.name; });
      setCategoryMap(map);
    } finally {
      setLoading(false);
    }
  }, [ownerUserId]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  const today = new Date();
  const daysElapsed = getDate(today);
  const daysInMonth = getDaysInMonth(today);
  const monthProgress = daysElapsed / daysInMonth;

  const rows = useMemo<Row[]>(() => {
    const proj = new Map<string, number>();
    recurring.filter((r) => r.is_active).forEach((r) => {
      const cat = r.category_id ? categoryMap[r.category_id] ?? "Uncategorized" : "Uncategorized";
      proj.set(cat, (proj.get(cat) ?? 0) + monthlyEquivalent(r));
    });
    const act = new Map<string, number>();
    expenses.filter((e) => e.status !== "rejected").forEach((e) => {
      const cat = e.category_id ? categoryMap[e.category_id] ?? "Uncategorized" : "Uncategorized";
      act.set(cat, (act.get(cat) ?? 0) + Number(e.total_amount));
    });
    const names = new Set<string>([...proj.keys(), ...act.keys()]);
    return Array.from(names).map((category) => ({
      category,
      projected: proj.get(category) ?? 0,
      actual: act.get(category) ?? 0,
    })).sort((a, b) => (b.projected + b.actual) - (a.projected + a.actual));
  }, [recurring, expenses, categoryMap]);

  const totalProjected = rows.reduce((s, r) => s + r.projected, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  // Projected run-rate based on pace so far this month
  const projectedRunRate = monthProgress > 0 ? totalActual / monthProgress : 0;
  const variance = projectedRunRate - totalProjected;
  const overCategories = rows.filter((r) => r.actual > r.projected && r.projected > 0).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            <div className="text-[11px] font-bold uppercase tracking-[0.14em]">Monthly Budget</div>
          </div>
          <div className="text-3xl font-extralight tracking-tight mt-2 tabular-nums">${totalProjected.toFixed(0)}</div>
          <p className="text-[11px] text-muted-foreground mt-1">From active recurring templates</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">MTD Actual</div>
          <div className="text-3xl font-extralight tracking-tight mt-2 tabular-nums">${totalActual.toFixed(0)}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Day {daysElapsed} of {daysInMonth}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Projected Run-Rate</div>
          <div className="text-3xl font-extralight tracking-tight mt-2 tabular-nums">${projectedRunRate.toFixed(0)}</div>
          <p className="text-[11px] text-muted-foreground mt-1">If spending continues at current pace</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="flex items-center gap-2">
            {variance > 0 ? <TrendingUp className="h-3.5 w-3.5 text-destructive" /> : <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />}
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Variance</div>
          </div>
          <div className={`text-3xl font-extralight tracking-tight mt-2 tabular-nums ${variance > 0 ? "text-destructive" : "text-emerald-600"}`}>
            {variance >= 0 ? "+" : "−"}${Math.abs(variance).toFixed(0)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{overCategories} category(ies) over budget</p>
        </CardContent></Card>
      </div>

      <div>
        <h2 className="text-base font-semibold tracking-tight">Category Forecast</h2>
        <p className="text-xs text-muted-foreground">Projected monthly spend (from recurring templates) vs actual MTD spend.</p>
      </div>

      {rows.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="p-12 text-center space-y-3">
            <div className="size-12 mx-auto rounded-md bg-muted flex items-center justify-center">
              <Target className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">No budget data yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Add recurring expense templates to build a monthly projection, or log expenses to see actual spend.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Category</th>
                <th className="text-right px-4 py-2 font-semibold">Projected</th>
                <th className="text-right px-4 py-2 font-semibold">Actual MTD</th>
                <th className="text-left px-4 py-2 font-semibold w-[40%]">Utilization</th>
                <th className="text-right px-4 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.projected > 0 ? (r.actual / r.projected) * 100 : r.actual > 0 ? 100 : 0;
                const pacePct = monthProgress * 100;
                const overBudget = r.projected > 0 && r.actual > r.projected;
                const aheadOfPace = r.projected > 0 && pct > pacePct + 10;
                const unbudgeted = r.projected === 0 && r.actual > 0;
                return (
                  <tr key={r.category} className="border-t border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{r.category}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {r.projected > 0 ? `$${r.projected.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">${r.actual.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="relative h-2 w-full rounded-md bg-muted overflow-hidden">
                        {/* pace marker */}
                        {r.projected > 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-foreground/40 z-10"
                            style={{ left: `${Math.min(100, pacePct)}%` }}
                            title={`Month pace: ${pacePct.toFixed(0)}%`}
                          />
                        )}
                        <div
                          className={`h-full transition-all ${overBudget ? "bg-destructive" : aheadOfPace ? "bg-amber-500" : "bg-primary"}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                        {pct.toFixed(0)}% used · pace {pacePct.toFixed(0)}%
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {unbudgeted ? (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <AlertTriangle className="h-3 w-3" /> Unbudgeted
                        </Badge>
                      ) : overBudget ? (
                        <Badge variant="destructive" className="text-[10px]">Over budget</Badge>
                      ) : aheadOfPace ? (
                        <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500">Ahead of pace</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">On track</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/30 border-t border-border/60">
              <tr>
                <td className="px-4 py-3 font-bold text-xs uppercase tracking-wider">Total</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">${totalProjected.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">${totalActual.toFixed(2)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
