import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./responsive-table.css";

/**
 * ResponsiveTable — six decisions fix the spreadsheet in disguise.
 *
 * 1. NUMBERS RIGHT, TEXT LEFT. Amounts centered never line up — the eye
 *    can't compare. Right-aligned tabular figures read like a receipt.
 * 2. NO ZEBRA STRIPES. One hairline between rows. Hover lights the row
 *    you're on. Stripes earn their place on wide rows only.
 * 3. ROW HEIGHT IS A DECISION: compact 40, default 48, comfortable 56.
 *    Dense for ops, airy for review. One toggle.
 * 4. PIN THE FIRST COLUMN + HEADER. 12 columns, screen shows 6 — scroll
 *    right and the name stays. Context never leaves the screen.
 * 5. EMPTY CELL IS A DASH. Missing, zero, or loading? A dash answers.
 *    Long text truncates with tooltip. Numbers never truncate.
 * 6. ACTIONS REVEAL ON HOVER. 50 rows, 50 pencils is noise. Hover/focus
 *    reveals, touch gets a kebab.
 *
 * Mobile (< 700px container): stacked cards, two lines per row.
 * - Line 1: identity left | amount right (tabular, fixed slot)
 * - Line 2: status + labeled dates. Tap: ID/notes/actions expand in place.
 */

export type TableDensity = "compact" | "default" | "comfortable";

export interface ResponsiveColumn<T> {
  key: string;
  header: string;
  /** Priority for mobile: 1 = stays visible, higher = hides first. ID/state hide first. */
  priority: number;
  /** Alignment: numbers right + tabular, text left. Amounts centered is a spreadsheet in disguise. */
  align?: "left" | "right";
  /** Pin this column on horizontal scroll. First column default. */
  pinned?: boolean;
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
  /** Row height: compact 40, default 48, comfortable 56. Dense for ops, airy for review. */
  density?: TableDensity;
  /** Row actions — revealed on hover/focus, kebab on touch. Not a column of pencils. */
  rowActions?: (row: T) => ReactNode;
  /**
   * Bulk selection. Pass the return of useRowSelection.
   * Header checkbox: checked / empty / partial. Clicking partial selects all.
   */
  selection?: {
    headerState: "checked" | "empty" | "partial";
    toggleHeader: () => void;
    toggleRow: (row: T, visibleIdx: number, shiftKey: boolean) => void;
    isSelected: (row: T) => boolean;
    selectAllLabel: string;
  };
  className?: string;
}

const densityPx: Record<TableDensity, number> = {
  compact: 40,
  default: 48,
  comfortable: 56,
};

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  toolbar,
  emptyState,
  onViewRecord,
  density = "default",
  rowActions,
  selection,
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
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted/50 backdrop-blur">
              {selection && (
                <th className="w-10 px-2" aria-label="Select rows">
                  <button
                    type="button"
                    onClick={selection.toggleHeader}
                    aria-label={selection.selectAllLabel}
                    title={selection.selectAllLabel}
                    className="flex h-10 w-10 items-center justify-center"
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded border-2",
                        selection.headerState === "checked" &&
                          "border-primary bg-primary text-primary-foreground",
                        selection.headerState === "empty" &&
                          "border-muted-foreground/40",
                        selection.headerState === "partial" &&
                          "border-primary bg-primary/30"
                      )}
                    >
                      {selection.headerState === "checked" && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                          <path d="M10.5 2.5 4.5 8.5 1.5 5.5" stroke="currentColor" strokeWidth="2" fill="none" />
                        </svg>
                      )}
                      {selection.headerState === "partial" && (
                        <span className="h-0.5 w-2.5 bg-primary" />
                      )}
                    </span>
                  </button>
                </th>
              )}
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                    col.align === "right" ? "text-right" : "text-left",
                    (col.pinned || i === 0) && "sticky left-0 bg-muted/50 backdrop-blur z-10",
                    col.className
                  )}
                  style={{ height: densityPx[density] }}
                >
                  {col.header}
                </th>
              ))}
              {rowActions && <th className="w-10" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, visibleIdx) => (
              <tr
                key={rowKey(row)}
                className="border-b border-border/50 last:border-0 hover:bg-muted/40 group"
              >
                {selection && (
                  <td className="w-10 px-2">
                    <button
                      type="button"
                      onClick={(e) =>
                        selection.toggleRow(row, visibleIdx, e.shiftKey)
                      }
                      aria-label={`Select row ${visibleIdx + 1}`}
                      className="flex h-10 w-10 items-center justify-center"
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded border-2",
                          selection.isSelected(row)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        )}
                      >
                        {selection.isSelected(row) && (
                          <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current">
                            <path d="M10.5 2.5 4.5 8.5 1.5 5.5" stroke="currentColor" strokeWidth="2" fill="none" />
                          </svg>
                        )}
                      </span>
                    </button>
                  </td>
                )}
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4",
                      col.align === "right" && "text-right font-mono tabular-nums",
                      (col.pinned || i === 0) && "sticky left-0 bg-card group-hover:bg-muted/40 z-10",
                      col.className
                    )}
                    style={{ height: densityPx[density] }}
                  >
                    <span className="block truncate" title={typeof col.render(row) === "string" ? String(col.render(row)) : undefined}>
                      {col.render(row) ?? <span className="text-muted-foreground">—</span>}
                    </span>
                  </td>
                ))}
                {rowActions && (
                  <td className="w-10 px-2">
                    <span className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100">
                      {rowActions(row)}
                    </span>
                  </td>
                )}
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
