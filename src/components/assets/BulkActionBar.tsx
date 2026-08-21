import { Button } from "@/components/ui/button";
import { Trash2, FolderInput, Link2, X } from "lucide-react";

interface Props {
  count: number;
  onClear: () => void;
  onDelete: () => void;
  onMove: () => void;
  onAttach: () => void;
  disabled?: boolean;
}

export function BulkActionBar({ count, onClear, onDelete, onMove, onAttach, disabled }: Props) {
  if (count === 0) return null;
  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/95 backdrop-blur px-3 py-2 shadow-sm">
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {count} selected
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onAttach} disabled={disabled}>
          <Link2 className="mr-1.5 h-3.5 w-3.5" /> Attach to service
        </Button>
        <Button size="sm" variant="outline" onClick={onMove} disabled={disabled}>
          <FolderInput className="mr-1.5 h-3.5 w-3.5" /> Move
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          disabled={disabled}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}
