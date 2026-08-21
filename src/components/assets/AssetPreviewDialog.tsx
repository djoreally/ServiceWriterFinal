import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Loader2, FileWarning } from "lucide-react";
import { safeGetSignedUrl } from "@/lib/assets/safe";
import type { AssetRecord } from "@/application/commands/assets.command";
import { formatBytes } from "@/lib/assets/validation";

interface Props {
  asset: AssetRecord | null;
  onOpenChange: (open: boolean) => void;
}

export function AssetPreviewDialog({ asset, onOpenChange }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!asset) {
      setUrl(null);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    safeGetSignedUrl(asset.storage_path, 3600)
      .then((u) => {
        if (cancelled) return;
        if (u) setUrl(u);
        else setFailed(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [asset]);

  return (
    <Dialog open={!!asset} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">{asset?.original_filename}</DialogTitle>
        </DialogHeader>
        <div className="min-h-[300px] flex items-center justify-center bg-muted/30 rounded-md overflow-hidden">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : failed || !url ? (
            <div className="p-8 text-center space-y-2 text-muted-foreground">
              <FileWarning className="h-8 w-8 mx-auto" />
              <p className="text-sm">Preview unavailable</p>
            </div>
          ) : asset?.asset_type === "image" ? (
            <img
              src={url}
              alt={asset.original_filename}
              className="max-h-[70vh] w-auto object-contain"
            />
          ) : asset?.asset_type === "video" ? (
            <video src={url} controls className="max-h-[70vh] w-full" />
          ) : asset?.asset_type === "audio" ? (
            <audio src={url} controls className="w-full px-6" />
          ) : asset?.mime_type === "application/pdf" ? (
            <iframe
              src={url}
              title={asset.original_filename}
              className="w-full h-[70vh] border-0"
            />
          ) : (
            <div className="p-8 text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Preview not available for this file type.
              </p>
              <Button asChild>
                <a href={url} target="_blank" rel="noreferrer" download>
                  <Download className="mr-2 h-4 w-4" /> Download
                </a>
              </Button>
            </div>
          )}
        </div>
        {asset && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
            <span>
              {asset.mime_type} · {formatBytes(asset.file_size)}
            </span>
            {url && (
              <Button asChild variant="ghost" size="sm">
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 h-3 w-3" /> Open in new tab
                </a>
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
