import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./responsive-table.css";

/**
 * ResponsiveTable — mobile table spec.
 *
 * Desktop (container >= 700px): full column table.
 * Mobile (container < 700px): stacked cards, two lines per row.
 *
 * Card layout rules:
 * - Line 1: identity (left) | amount (right, tabular-nums, fixed slot)
 * - Line 2: status + labeled dates ("Due Mar 4", never bare "Mar 4")
 * - Amounts need no label ($120 is self-evident); ambiguous fields get one.
 * - Tap row: ID, notes, actions expand in place.
 * - Full record: bottom sheet, never a new page.
 * - Sorting lives in an external control, not column headers.
 *
 * The breakpoint belongs to the TABLE (container query), not the screen.
 */

export interface ResponsiveColumn<T> {
  key: string;
  header: string;
  /** Priority for mobile: 1 = stays visible, higher = hides first. ID/state hide first. */
  priority: number;
  render: (row: T) => ReactNode;
  cardPrimary?: (row: T) => ReactNode;
  cardAmount?: (row: T) => ReactNode;
  cardMeta?: (row: T) => ReactNode[];
  cardExpanded?: (row: T) => ReactNode;
  className?: string;
}

interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  toolbar?: ReactNode;
  emptyState?: ReactNode;
  onViewRecord?: (row: T) => void;
  className?: string;
}

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  toolbar,
  emptyState,
  onViewRecord,
  className,
}: ResponsiveTableProps<T>) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const sorted = [...columns].sort((a, b) => a.priority - b.priority);
  const primaryCol = sorted.find((c) => c.cardPrimary);
  const amountCol = sorted.find((c) => c.cardAmount);
  const metaCols = sorted.filter((c) => c.cardMeta);
  const expandedCols = sorted.filter((c) => c.cardExpanded);

  return (
    <div className={cn("responsive-table-container", className)}>
      {toolbar}

      <div className="responsive-table-desktop overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b last:border-0 hover:bg-muted/30">
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3", col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && emptyState}
      </div>

      <div className="responsive-table-cards">
        {rows.map((row) => {
          const key = rowKey(row);
          const isExpanded = expandedKey === key;
          return (
            <div key={key} className="rounded-lg border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedKey(isExpanded ? null : key)}
                className="w-full text-left p-4 active:bg-muted/50"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium truncate">
                    {primaryCol?.cardPrimary?.(row)}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-base font-semibold">
                    {amountCol?.cardAmount?.(row)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {metaCols.map((col) =>
                    (col.cardMeta?.(row) ?? []).map((node, j) => (
                      <span key={`${col.key}-${j}`}>{node}</span>
                    ))
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t px-4 py-3 space-y-3 bg-muted/30">
                  {expandedCols.map((col) => (
                    <div key={col.key}>{col.cardExpanded?.(row)}</div>
                  ))}
                  {onViewRecord && (
                    <button
                      type="button"
                      onClick={() => onViewRecord(row)}
                      className="text-sm font-medium text-primary"
                    >
                      View full record
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && emptyState}
      </div>
    </div>
  );
}
