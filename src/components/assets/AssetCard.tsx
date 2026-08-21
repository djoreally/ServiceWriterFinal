import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Download, Pencil, Trash2, Link as LinkIcon } from "lucide-react";
import type { AssetRecord } from "@/application/commands/assets.command";
import { formatBytes } from "@/lib/assets/validation";
import { AssetThumbnail } from "./AssetThumbnail";

interface Props {
  asset: AssetRecord;
  onPreview: (a: AssetRecord) => void;
  onRename: (a: AssetRecord) => void;
  onDelete: (a: AssetRecord) => void;
  onCopyLink: (a: AssetRecord) => void;
  onDownload: (a: AssetRecord) => void;
  selected?: boolean;
  onToggleSelect?: (a: AssetRecord, e: React.MouseEvent) => void;
}

export function AssetCard({
  asset,
  onPreview,
  onRename,
  onDelete,
  onCopyLink,
  onDownload,
  selected = false,
  onToggleSelect,
}: Props) {
  return (
    <div
      className={`group relative rounded-lg border bg-card overflow-hidden hover:shadow-md transition-shadow ${
        selected ? "ring-2 ring-primary border-primary" : ""
      }`}
    >
      {onToggleSelect && (
        <div
          className={`absolute left-2 top-2 z-10 transition-opacity ${
            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <button
            type="button"
            aria-label={selected ? "Deselect asset" : "Select asset"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(asset, e);
            }}
            className="flex h-6 w-6 items-center justify-center rounded bg-background/90 backdrop-blur border shadow-sm"
          >
            <Checkbox checked={selected} className="pointer-events-none" />
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          if (onToggleSelect && (e.shiftKey || e.metaKey || e.ctrlKey)) {
            onToggleSelect(asset, e);
            return;
          }
          if (selected && onToggleSelect) {
            onToggleSelect(asset, e);
            return;
          }
          onPreview(asset);
        }}
        className="block w-full aspect-square overflow-hidden"
      >
        <AssetThumbnail asset={asset} />
      </button>
      <div className="p-2.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate" title={asset.original_filename}>
            {asset.original_filename}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {formatBytes(asset.file_size)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onPreview(asset)}>
              <Eye className="mr-2 h-4 w-4" /> Preview
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDownload(asset)}>
              <Download className="mr-2 h-4 w-4" /> Download
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCopyLink(asset)}>
              <LinkIcon className="mr-2 h-4 w-4" /> Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRename(asset)}>
              <Pencil className="mr-2 h-4 w-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(asset)}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
