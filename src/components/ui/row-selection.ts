import { useCallback, useMemo, useState } from "react";

/**
 * useRowSelection — bulk selection done right.
 *
 * - Header checkbox has THREE states: checked, empty, partial.
 *   Clicking partial selects everything, never clears it.
 * - "Select all" means ALL matching rows, not the 6 on screen.
 *   Say the number out loud: "Select all 247 matching."
 * - Filter moves the number — the label reads it live.
 * - Shift-click picks a range. Every desktop user expects it.
 * - Selection lives in app state, not visible rows. Page changes don't kill it.
 * - Deleting needs no confirm modal. Echo the count in the button,
 *   run it, offer undo for 10 seconds. Reversible beats careful.
 */

export type HeaderState = "checked" | "empty" | "partial";

interface UseRowSelectionProps<T> {
  /** All matching rows (after filter, before pagination). */
  allRows: T[];
  rowKey: (row: T) => string;
}

export function useRowSelection<T>({ allRows, rowKey }: UseRowSelectionProps<T>) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);

  const allKeys = useMemo(() => allRows.map(rowKey), [allRows, rowKey]);
  const selectedCount = selectedKeys.size;
  const totalCount = allRows.length;

  const headerState: HeaderState = useMemo(() => {
    if (selectedCount === 0) return "empty";
    if (selectedCount === totalCount && totalCount > 0) return "checked";
    return "partial";
  }, [selectedCount, totalCount]);

  /** Header click: partial → select all. Checked → clear. Empty → select all. */
  const toggleHeader = useCallback(() => {
    if (headerState === "checked") {
      setSelectedKeys(new Set());
    } else {
      // Partial or empty: select EVERYTHING matching, not just visible.
      setSelectedKeys(new Set(allKeys));
    }
    setLastClickedIdx(null);
  }, [headerState, allKeys]);

  const toggleRow = useCallback(
    (row: T, visibleIdx: number, shiftKey: boolean) => {
      const key = rowKey(row);

      if (shiftKey && lastClickedIdx !== null) {
        // Shift-click: range select across the full list, not just the page.
        const allIdx = allKeys.indexOf(key);
        const [from, to] =
          lastClickedIdx < allIdx
            ? [lastClickedIdx, allIdx]
            : [allIdx, lastClickedIdx];
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          for (let i = from; i <= to; i++) next.add(allKeys[i]);
          return next;
        });
        return;
      }

      setLastClickedIdx(allKeys.indexOf(key));
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [allKeys, lastClickedIdx, rowKey]
  );

  const isSelected = useCallback((row: T) => selectedKeys.has(rowKey(row)), [
    selectedKeys,
    rowKey,
  ]);

  const clear = useCallback(() => {
    setSelectedKeys(new Set());
    setLastClickedIdx(null);
  }, []);

  /** Label that says the number out loud. Updates live with filters. */
  const selectAllLabel =
    totalCount === 0
      ? "Select all"
      : `Select all ${totalCount} matching`;

  return {
    selectedKeys,
    selectedCount,
    totalCount,
    headerState,
    toggleHeader,
    toggleRow,
    isSelected,
    clear,
    selectAllLabel,
  };
}

interface UseUndoProps {
  /** How long the undo window stays open. Default 10s. */
  timeoutMs?: number;
}

/**
 * Undo window — reversible beats careful.
 * Run the delete, echo the count, offer undo for 10 seconds.
 */
export function useUndo({ timeoutMs = 10_000 }: UseUndoProps = {}) {
  const [undoState, setUndoState] = useState<{
    count: number;
    label: string;
    onUndo: () => void;
  } | null>(null);

  const runWithUndo = useCallback(
    (opts: { count: number; label: string; run: () => void; undo: () => void }) => {
      opts.run();
      setUndoState({ count: opts.count, label: opts.label, onUndo: opts.undo });
      setTimeout(() => setUndoState(null), timeoutMs);
    },
    [timeoutMs]
  );

  const dismiss = useCallback(() => setUndoState(null), []);

  return { undoState, runWithUndo, dismiss };
}
