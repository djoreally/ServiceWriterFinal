/* eslint-disable react-refresh/only-export-components */
import { ReactNode, useMemo } from "react";
import { Badge } from "@/components/ui/badge";

export type FilterChip = { id: string; label: string; value: string };

export const useInlineSearchPreview = <T,>(items: T[], query: string, accessors: Array<(item: T) => string>) => {
  const normalizedQuery = query.trim().toLowerCase();

  return useMemo(() => {
    if (!normalizedQuery) return items;
    return items.filter((item) => accessors.some((accessor) => accessor(item).toLowerCase().includes(normalizedQuery)));
  }, [accessors, items, normalizedQuery]);
};

export const highlightSearchMatch = (value: string, query: string): ReactNode => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return value;
  const index = value.toLowerCase().indexOf(normalizedQuery.toLowerCase());
  if (index === -1) return value;

  return (
    <>
      {value.slice(0, index)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">{value.slice(index, index + normalizedQuery.length)}</mark>
      {value.slice(index + normalizedQuery.length)}
    </>
  );
};

export const FilterChipList = ({ chips, onRemove }: { chips: FilterChip[]; onRemove: (id: string) => void }) => {
  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <Badge key={chip.id} variant="secondary" className="gap-1">
          <span>{chip.label}: {chip.value}</span>
          <button type="button" className="rounded-md px-1 hover:bg-background/70" onClick={() => onRemove(chip.id)} aria-label={`Remove ${chip.label} filter`}>
            ×
          </button>
        </Badge>
      ))}
    </div>
  );
};
