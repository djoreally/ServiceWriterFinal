import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Repeat, Pencil, Trash2, RefreshCw, CalendarClock } from "lucide-react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { toast } from "@/hooks/use-toast";

import {
  fetchRecurringExpenses,
  processDueRecurringExpenses,
  type RecurringExpenseRow,
} from "@/application/queries/recurring-expenses.query";
import {
  deleteRecurringExpense,
  toggleRecurringExpenseActive,
} from "@/application/commands/recurring-expenses.command";
import { fetchExpenseCategories } from "@/application/queries/expenses.query";
import { RecurringExpenseDialog } from "./RecurringExpenseDialog";

interface Props {
  ownerUserId: string | null;
  onLedgerChanged?: () => void;
}

const FREQ_LABEL: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

// Normalize monthly-equivalent amount for the rollup KPI
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

export function RecurringExpensesTab({ ownerUserId, onLedgerChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RecurringExpenseRow[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpenseRow | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!ownerUserId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [{ data }, { data: cats }] = await Promise.all([
        fetchRecurringExpenses(ownerUserId),
        fetchExpenseCategories(ownerUserId),
      ]);
      setRows((data as unknown as RecurringExpenseRow[]) ?? []);
      const map: Record<string, string> = {};
      (cats ?? []).forEach((c) => { map[c.id] = c.name; });
      setCategoryMap(map);
    } finally {
      setLoading(false);
    }
  }, [ownerUserId]);

  useEffect(() => { load(); }, [load]);

  // Auto-process due recurring expenses when tab loads
  useEffect(() => {
    (async () => {
      if (!ownerUserId) return;
      try {
        const generated = await processDueRecurringExpenses(ownerUserId);
        if (generated > 0) {
          toast({ title: "Recurring expenses posted", description: `${generated} new entry(ies) added to ledger.` });
          await load();
          onLedgerChanged?.();
        }
      } catch (e: any) {
        console.warn("Auto-generate recurring failed:", e?.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerUserId]);

  const runGenerate = async () => {
    if (!ownerUserId) return;
    setGenerating(true);
    try {
      const n = await processDueRecurringExpenses(ownerUserId);
      toast({ title: n > 0 ? `${n} expense(s) posted` : "Nothing due", description: n > 0 ? "Generated ledger entries from due recurring templates." : "All recurring expenses are up to date." });
      await load();
      if (n > 0) onLedgerChanged?.();
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const monthlyTotal = useMemo(
    () => rows.filter((r) => r.is_active).reduce((s, r) => s + monthlyEquivalent(r), 0),
    [rows],
  );
  const activeCount = rows.filter((r) => r.is_active).length;
  const dueSoonCount = rows.filter((r) => {
    if (!r.is_active) return false;
    const d = differenceInCalendarDays(parseISO(r.next_due_date), new Date());
    return d <= 7;
  }).length;

  const handleToggle = async (r: RecurringExpenseRow, v: boolean) => {
    try {
      await toggleRecurringExpenseActive(r.id, v);
      setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, is_active: v } : x));
    } catch (e: any) {
      toast({ title: "Could not update", description: e?.message ?? "Try again", variant: "destructive" });
    }
  };

  const handleDelete = async (r: RecurringExpenseRow) => {
    if (!confirm(`Delete recurring expense "${r.name}"? Existing ledger entries will be kept.`)) return;
    try {
      await deleteRecurringExpense(r.id);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      toast({ title: "Deleted", description: r.name });
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message ?? "Try again", variant: "destructive" });
    }
  };

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Monthly Run-Rate</div>
          <div className="text-3xl font-extralight tracking-tight mt-2 tabular-nums">${monthlyTotal.toFixed(2)}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Normalized across all active templates</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Active Templates</div>
          <div className="text-3xl font-extralight tracking-tight mt-2 tabular-nums">{activeCount}</div>
          <p className="text-[11px] text-muted-foreground mt-1">{rows.length - activeCount} paused</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Due in 7 Days</div>
          <div className="text-3xl font-extralight tracking-tight mt-2 tabular-nums">{dueSoonCount}</div>
          <p className="text-[11px] text-muted-foreground mt-1">Auto-posts to ledger on due date</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Recurring Templates</h2>
          <p className="text-xs text-muted-foreground">Monthly bills, subscriptions, and other repeating expenses.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runGenerate} disabled={generating} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} /> Post Due Now
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add Recurring
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="p-12 text-center space-y-4">
            <div className="size-12 mx-auto rounded-md bg-muted flex items-center justify-center">
              <Repeat className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold">No recurring expenses yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Add monthly bills like van payments, insurance, and software subscriptions. We'll auto-post them on each due date.
              </p>
            </div>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Add First Recurring Expense
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Name</th>
                <th className="text-left px-4 py-2 font-semibold">Category</th>
                <th className="text-left px-4 py-2 font-semibold">Frequency</th>
                <th className="text-right px-4 py-2 font-semibold">Amount</th>
                <th className="text-left px-4 py-2 font-semibold">Next Due</th>
                <th className="text-center px-4 py-2 font-semibold">Active</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const daysUntil = differenceInCalendarDays(parseISO(r.next_due_date), new Date());
                return (
                  <tr key={r.id} className="border-t border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{r.vendor_name}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.category_id ? categoryMap[r.category_id] ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">{FREQ_LABEL[r.frequency] ?? r.frequency}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">${Number(r.amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{format(parseISO(r.next_due_date), "MMM d, yyyy")}</span>
                      </div>
                      <div className={`text-[10px] mt-0.5 ${daysUntil < 0 ? "text-destructive" : daysUntil <= 7 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? "Due today" : `in ${daysUntil}d`}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch checked={r.is_active} onCheckedChange={(v) => handleToggle(r, v)} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(r); setDialogOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RecurringExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editing}
        onSaved={load}
      />
    </div>
  );
}
