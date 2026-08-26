import { toast } from "@/components/ui/sonner";

type CsvCell = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvCell;
}

const formatCsvCell = (value: CsvCell) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

export function downloadCsv<T>(filenamePrefix: string, columns: CsvColumn<T>[], rows: T[]) {
  if (!rows.length) {
    toast.info(`No ${filenamePrefix.replace(/-/g, " ")} to export`);
    return;
  }

  const csv = [
    columns.map((column) => formatCsvCell(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => formatCsvCell(column.value(row))).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  toast.success(`Exported ${rows.length} ${filenamePrefix.replace(/-/g, " ")}`);
}
