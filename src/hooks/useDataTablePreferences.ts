import { useCallback, useEffect, useMemo, useState } from "react";

export type TableDensity = "compact" | "normal" | "comfortable";

export type DataTablePreferences = {
  columnOrder: string[];
  columnWidths: Record<string, number>;
  density: TableDensity;
  hiddenColumns: string[];
};

const defaultPreferences: DataTablePreferences = {
  columnOrder: [],
  columnWidths: {},
  density: "normal",
  hiddenColumns: [],
};

const readPreferences = (key: string): DataTablePreferences => {
  if (typeof window === "undefined") return defaultPreferences;
  try {
    return { ...defaultPreferences, ...JSON.parse(window.localStorage.getItem(key) ?? "{}") };
  } catch {
    return defaultPreferences;
  }
};

export const useDataTablePreferences = (storageKey: string, columns: string[]) => {
  const [preferences, setPreferences] = useState<DataTablePreferences>(() => readPreferences(storageKey));
  const [selectedRows, setSelectedRows] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  }, [preferences, storageKey]);

  const visibleColumns = useMemo(() => {
    const ordered = preferences.columnOrder.length ? preferences.columnOrder.filter((id) => columns.includes(id)) : columns;
    const missing = columns.filter((id) => !ordered.includes(id));
    return [...ordered, ...missing].filter((id) => !preferences.hiddenColumns.includes(id));
  }, [columns, preferences.columnOrder, preferences.hiddenColumns]);

  const setDensity = useCallback((density: TableDensity) => {
    setPreferences((current) => ({ ...current, density }));
  }, []);

  const toggleColumn = useCallback((columnId: string) => {
    setPreferences((current) => ({
      ...current,
      hiddenColumns: current.hiddenColumns.includes(columnId)
        ? current.hiddenColumns.filter((id) => id !== columnId)
        : [...current.hiddenColumns, columnId],
    }));
  }, []);

  const resizeColumn = useCallback((columnId: string, width: number) => {
    setPreferences((current) => ({
      ...current,
      columnWidths: { ...current.columnWidths, [columnId]: width },
    }));
  }, []);

  const reorderColumns = useCallback((columnOrder: string[]) => {
    setPreferences((current) => ({ ...current, columnOrder }));
  }, []);

  const toggleRow = useCallback((rowId: string) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedRows(new Set()), []);

  return {
    clearSelection,
    preferences,
    reorderColumns,
    resizeColumn,
    selectedRows,
    setDensity,
    setPreferences,
    toggleColumn,
    toggleRow,
    visibleColumns,
  };
};
