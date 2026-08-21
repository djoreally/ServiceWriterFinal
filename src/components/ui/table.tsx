import * as React from "react";
import { cn } from "@/lib/utils";

type TableDensity = "compact" | "standard" | "comfortable";
const TableDensityContext = React.createContext<TableDensity>("standard");
export interface TableProps extends React.HTMLAttributes<HTMLTableElement> { density?: TableDensity }

const Table = React.forwardRef<HTMLTableElement, TableProps>(({ className, density = "standard", ...props }, ref) => (
  <TableDensityContext.Provider value={density}><div className="relative w-full overflow-x-auto overscroll-x-contain"><table ref={ref} data-density={density} className={cn("w-full caption-bottom text-sm", className)} {...props} /></div></TableDensityContext.Provider>
));
Table.displayName = "Table";
const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />);
TableHeader.displayName = "TableHeader";
const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />);
TableBody.displayName = "TableBody";
const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(({ className, ...props }, ref) => <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />);
TableFooter.displayName = "TableFooter";
const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(({ className, ...props }, ref) => <tr ref={ref} className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50", className)} {...props} />);
TableRow.displayName = "TableRow";

const headDensity = { compact: "h-8 px-3", standard: "h-9 px-3", comfortable: "h-11 px-4" };
const cellDensity = { compact: "px-3 py-1.5", standard: "px-3 py-2", comfortable: "px-4 py-3" };
const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => {
  const density = React.useContext(TableDensityContext);
  return <th ref={ref} className={cn("bg-muted/40 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground [&:has([role=checkbox])]:pr-0", headDensity[density], className)} {...props} />;
});
TableHead.displayName = "TableHead";
const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(({ className, ...props }, ref) => {
  const density = React.useContext(TableDensityContext);
  return <td ref={ref} className={cn("align-middle [&:has([role=checkbox])]:pr-0", cellDensity[density], className)} {...props} />;
});
TableCell.displayName = "TableCell";
const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(({ className, ...props }, ref) => <caption ref={ref} className={cn("mt-3 text-sm text-muted-foreground", className)} {...props} />);
TableCaption.displayName = "TableCaption";
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
