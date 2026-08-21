import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import type { ExpenseRow } from "@/application/queries/expenses.query";

interface ExpenseTableProps {
  expenses: ExpenseRow[];
  categoryMap: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  approved: "secondary",
  rejected: "destructive",
  reimbursed: "default",
};

export function ExpenseTable({ expenses, categoryMap, selectedId, onSelect }: ExpenseTableProps) {
  if (expenses.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No expenses yet. Tap "Scan Receipt" to add the first one.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Date</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="w-24 text-right">Total</TableHead>
            <TableHead className="w-24">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((e) => (
            <TableRow
              key={e.id}
              data-state={selectedId === e.id ? "selected" : undefined}
              className="cursor-pointer"
              onClick={() => onSelect(e.id)}
            >
              <TableCell className="text-xs">
                {format(parseISO(e.transaction_date), "MMM d")}
              </TableCell>
              <TableCell>
                <div className="font-medium text-sm">{e.vendor_name_raw}</div>
                {e.is_billable && (
                  <span className="text-[10px] uppercase text-primary font-bold">Billable</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {e.category_id ? categoryMap[e.category_id] ?? "—" : "—"}
              </TableCell>
              <TableCell className="text-right font-bold tabular-nums">
                ${Number(e.total_amount).toFixed(2)}
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[e.status] ?? "outline"} className="text-[10px]">
                  {e.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
