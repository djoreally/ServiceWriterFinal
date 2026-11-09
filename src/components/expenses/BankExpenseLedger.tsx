import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import type { StoredBankTransaction } from "@/application/queries/accounting.query";
import {
  accountingClassificationLabel,
  isBankExpenseClassification,
  type AccountingClassification,
} from "@/features/accounting/accounting-engine";
import {
  findVendorClassificationRule,
  type VendorClassificationRule,
} from "@/features/accounting/vendor-rules";

export interface BankExpenseGroup {
  classification: AccountingClassification;
  rows: StoredBankTransaction[];
  total: number;
}

/**
 * Group a workspace's bank outflows into the expense ledger's sections:
 * one group per classification, biggest spend first, newest rows first
 * inside each group. Only outflows in expense classifications appear —
 * revenue, refunds, capital and internal transfers are not spending.
 */
export function buildBankExpenseGroups(rows: StoredBankTransaction[]): BankExpenseGroup[] {
  const byClassification = new Map<AccountingClassification, StoredBankTransaction[]>();
  for (const row of rows) {
    if (Number(row.amount) >= 0) continue;
    if (!isBankExpenseClassification(row.classification)) continue;
    const list = byClassification.get(row.classification) ?? [];
    list.push(row);
    byClassification.set(row.classification, list);
  }
  return Array.from(byClassification.entries())
    .map(([classification, groupRows]) => ({
      classification,
      rows: [...groupRows].sort((a, b) => b.posted_on.localeCompare(a.posted_on)),
      total: Math.round(groupRows.reduce((sum, r) => sum + Math.abs(Number(r.amount)), 0) * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);
}

const reviewBadge: Record<StoredBankTransaction["review_status"], { variant: "secondary" | "outline" | "destructive"; label: string }> = {
  approved: { variant: "secondary", label: "Approved" },
  pending: { variant: "outline", label: "Pending review" },
  rejected: { variant: "destructive", label: "Rejected" },
};

interface BankExpenseLedgerProps {
  groups: BankExpenseGroup[];
  filter: AccountingClassification | "all";
  onFilterChange: (filter: AccountingClassification | "all") => void;
  rules: VendorClassificationRule[];
}

export function BankExpenseLedger({ groups, filter, onFilterChange, rules }: BankExpenseLedgerProps) {
  const visibleGroups = useMemo(
    () => (filter === "all" ? groups : groups.filter((g) => g.classification === filter)),
    [groups, filter],
  );

  return (
    <div className="space-y-5">
      {rules.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Standing rules
          </span>
          {rules.map((rule) => (
            <Badge key={`${rule.match}-${rule.classification}`} variant="outline" className="text-xs">
              {rule.match} → {accountingClassificationLabel(rule.classification)}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground">
            Applied when the record is read — stored rows are never rewritten.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          className="h-8 px-3 text-xs"
          onClick={() => onFilterChange("all")}
        >
          All spending
        </Button>
        {groups.map((group) => (
          <Button
            key={group.classification}
            size="sm"
            variant={filter === group.classification ? "default" : "outline"}
            className="h-8 px-3 text-xs"
            onClick={() => onFilterChange(group.classification)}
          >
            {accountingClassificationLabel(group.classification)} · {group.rows.length}
          </Button>
        ))}
      </div>

      {visibleGroups.map((group) => (
        <div key={group.classification} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold tracking-tight">
              {accountingClassificationLabel(group.classification)}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {group.rows.length} transaction{group.rows.length === 1 ? "" : "s"}
              </span>
            </h3>
            <span className="text-sm font-semibold tabular-nums">${group.total.toFixed(2)}</span>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-36">Review</TableHead>
                  <TableHead className="w-28 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.rows.map((row) => {
                  const badge = reviewBadge[row.review_status];
                  const rule = findVendorClassificationRule(row.description_raw, rules);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs">
                        {format(parseISO(row.posted_on), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{row.description_raw}</div>
                        {rule && (
                          <span className="text-xs text-muted-foreground">
                            Standing rule: {rule.match} → {accountingClassificationLabel(rule.classification)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        ${Math.abs(Number(row.amount)).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}
