import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TableDensity } from "@/hooks/useDataTablePreferences";

type DataTableEnhancementToolbarProps = {
  columns: string[];
  density: TableDensity;
  hiddenColumns: string[];
  selectedCount: number;
  onBulkAction?: () => void;
  onDensityChange: (density: TableDensity) => void;
  onToggleColumn: (columnId: string) => void;
};

export const DataTableEnhancementToolbar = ({
  columns,
  density,
  hiddenColumns,
  selectedCount,
  onBulkAction,
  onDensityChange,
  onToggleColumn,
}: DataTableEnhancementToolbarProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
    <div className="text-sm text-muted-foreground" aria-live="polite">
      {selectedCount > 0 ? `${selectedCount} row${selectedCount === 1 ? "" : "s"} selected` : "Select rows for bulk actions"}
    </div>
    <div className="flex items-center gap-2">
      {selectedCount > 0 && onBulkAction ? <Button size="sm" onClick={onBulkAction}>Bulk actions</Button> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm"><Settings2 className="mr-2 h-4 w-4" /> Table view</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Density</DropdownMenuLabel>
          {(["compact", "normal", "comfortable"] as TableDensity[]).map((value) => (
            <DropdownMenuItem key={value} onSelect={() => onDensityChange(value)}>
              <span className={density === value ? "font-semibold" : undefined}>{value}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          {columns.map((column) => (
            <DropdownMenuItem key={column} onSelect={(event) => event.preventDefault()}>
              <Checkbox checked={!hiddenColumns.includes(column)} onCheckedChange={() => onToggleColumn(column)} className="mr-2" />
              {column}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
);
