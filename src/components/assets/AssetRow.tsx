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
import { getAssetIcon } from "./asset-icons";

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

export function AssetRow({
  asset,
  onPreview,
  onRename,
  onDelete,
  onCopyLink,
  onDownload,
  selected = false,
  onToggleSelect,
}: Props) {
  const Icon = getAssetIcon(asset);
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-md border bg-card hover:bg-accent/30 transition-colors ${
        selected ? "ring-2 ring-primary border-primary" : ""
      }`}
    >
      {onToggleSelect && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(asset, {} as React.MouseEvent)}
          aria-label="Select asset"
          className="shrink-0"
        />
      )}
      <button
        type="button"
        onClick={() => onPreview(asset)}
        className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0 text-muted-foreground"
      >
        <Icon className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onPreview(asset)}
        className="flex-1 min-w-0 text-left"
      >
        <p className="text-sm font-medium truncate">{asset.original_filename}</p>
        <p className="text-xs text-muted-foreground">
          {asset.mime_type} · {formatBytes(asset.file_size)}
        </p>
      </button>
      <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">
        {new Date(asset.created_at).toLocaleDateString()}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
            <MoreVertical className="h-4 w-4" />
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
  );
}
