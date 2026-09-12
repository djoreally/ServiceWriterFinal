import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

type TableDensity = "compact" | "standard" | "comfortable";
type TableSection = "header" | "body" | "footer";

const TableDensityContext = React.createContext<TableDensity>("standard");
const TableSectionContext = React.createContext<TableSection>("body");

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  density?: TableDensity;
  containerClassName?: string;
}

/**
 * Shared responsive table contract.
 *
 * Desktop: semantic table.
 * Narrow container: stacked records with generated cell labels and revealable
 * secondary fields. The table owns its breakpoint through container queries.
 */
const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, density = "standard", children, ...props }, forwardedRef) => {
    const tableRef = React.useRef<HTMLTableElement | null>(null);

    React.useImperativeHandle(forwardedRef, () => tableRef.current as HTMLTableElement);

    React.useEffect(() => {
      const table = tableRef.current;
      if (!table) return;

      const headerLabels = Array.from(table.querySelectorAll("thead th")).map((header) =>
        (header.textContent || "").replace(/s+/g, " ").trim(),
      );

      table.querySelectorAll("tbody tr").forEach((row) => {
        Array.from(row.querySelectorAll(":scope > td")).forEach((cell, index) => {
          if (!cell.hasAttribute("data-label")) {
            cell.setAttribute("data-label", headerLabels[index] || "");
          }
        });
      });
    }, [children]);

    return (
      <TableDensityContext.Provider value={density}>
        <div
          className={cn(
            "relative w-full [container-type:inline-size]",
            containerClassName,
          )}
        >
          <table
            ref={tableRef}
            data-density={density}
            data-responsive-table
            className={cn(
              "block w-full caption-bottom text-sm tabular-nums @min-[700px]:table",
              className,
            )}
            {...props}
          >
            {children}
          </table>
        </div>
      </TableDensityContext.Provider>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <TableSectionContext.Provider value="header">
    <thead
      ref={ref}
      className={cn(
        "hidden bg-muted/25 [&_tr]:border-b @min-[700px]:table-header-group",
        className,
      )}
      {...props}
    />
  </TableSectionContext.Provider>
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <TableSectionContext.Provider value="body">
    <tbody
      ref={ref}
      className={cn(
        "block space-y-2 @min-[700px]:table-row-group @min-[700px]:space-y-0 [&_tr:last-child]:border-0",
        className,
      )}
      {...props}
    />
  </TableSectionContext.Provider>
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <TableSectionContext.Provider value="footer">
    <tfoot
      ref={ref}
      className={cn(
        "block border-t bg-muted/50 font-medium @min-[700px]:table-footer-group [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  </TableSectionContext.Provider>
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, children, ...props }, ref) => {
  const section = React.useContext(TableSectionContext);
  const [expanded, setExpanded] = React.useState(false);
  const cells = React.Children.toArray(children);
  const isBody = section === "body";
  const shouldCollapse = isBody && cells.length > 4;

  const renderedChildren = cells.map((child, index) => {
    if (!React.isValidElement(child) || !isBody) return child;

    const existingClassName = (child.props as { className?: string }).className;
    const isSecondary = shouldCollapse && index >= 3 && index < cells.length - 1;

    return React.cloneElement(child as React.ReactElement<{ className?: string }>, {
      className: cn(
        existingClassName,
        isSecondary && !expanded
          ? "hidden @min-[700px]:table-cell"
          : "flex @min-[700px]:table-cell",
      ),
    });
  });

  return (
    <tr
      ref={ref}
      className={cn(
        "block rounded-xl border bg-card transition-colors data-[state=selected]:bg-[hsl(var(--primary-container-soft))] hover:bg-muted/30",
        "@min-[700px]:table-row @min-[700px]:rounded-none @min-[700px]:border-x-0 @min-[700px]:border-t-0",
        className,
      )}
      {...props}
    >
      {renderedChildren}
      {shouldCollapse ? (
        <td className="block border-t border-border/50 px-3 py-1.5 @min-[700px]:hidden">
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Hide details" : "More details"}
          </button>
        </td>
      ) : null}
    </tr>
  );
});
TableRow.displayName = "TableRow";

const headDensity = {
  compact: "h-8 px-3",
  standard: "h-9 px-3",
  comfortable: "h-11 px-4",
};
const cellDensity = {
  compact: "px-3 py-1.5",
  standard: "px-3 py-2",
  comfortable: "px-4 py-3",
};

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => {
  const density = React.useContext(TableDensityContext);
  return (
    <th
      ref={ref}
      className={cn(
        "text-left align-middle text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground [&:has([role=checkbox])]:pr-0",
        headDensity[density],
        className,
      )}
      {...props}
    />
  );
});
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, children, ...props }, ref) => {
  const density = React.useContext(TableDensityContext);
  return (
    <td
      ref={ref}
      className={cn(
        "items-start justify-between gap-4 align-middle before:mr-4 before:shrink-0 before:text-[11px] before:font-semibold before:uppercase before:tracking-[0.08em] before:text-muted-foreground before:content-[attr(data-label)]",
        "@min-[700px]:before:hidden [&:has([role=checkbox])]:pr-0",
        cellDensity[density],
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
});
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-3 text-sm text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
