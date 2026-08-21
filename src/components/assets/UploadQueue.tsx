import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { X, RotateCcw, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { UploadItem } from "@/hooks/useAssetUploads";
import { formatBytes } from "@/lib/assets/validation";

interface Props {
  items: UploadItem[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onClearCompleted: () => void;
}

export function UploadQueue({ items, onRetry, onDismiss, onClearCompleted }: Props) {
  if (items.length === 0) return null;
  const hasCompleted = items.some((i) => i.status === "success");

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border bg-card shadow-lg">
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h4 className="text-sm font-medium">
          Uploads ({items.length})
        </h4>
        {hasCompleted && (
          <Button size="sm" variant="ghost" onClick={onClearCompleted}>
            Clear done
          </Button>
        )}
      </div>
      <div className="max-h-[320px] overflow-y-auto divide-y">
        {items.map((item) => (
          <div key={item.id} className="px-4 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              {item.status === "uploading" && (
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              )}
              {item.status === "success" && (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              )}
              {item.status === "error" && (
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              {item.status === "queued" && (
                <div className="h-4 w-4 rounded-md border-2 border-muted-foreground/40 shrink-0" />
              )}
              <span className="flex-1 truncate text-xs">{item.file.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatBytes(item.file.size)}
              </span>
              {item.status === "error" && (
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onRetry(item.id)}>
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDismiss(item.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            {item.status === "uploading" && (
              <Progress value={item.progress} className="h-1" />
            )}
            {item.status === "error" && item.error && (
              <p className="text-[10px] text-destructive line-clamp-2">{item.error}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
