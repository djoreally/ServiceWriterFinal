import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { listAssetFolders } from "@/application/queries/service-assets.query";

interface Props {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (folder: string | null) => Promise<void> | void;
}

export function MoveToFolderDialog({ open, count, onOpenChange, onConfirm }: Props) {
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => listAssetFolders().then(setFolders).catch(() => setFolders([])));
    void Promise.resolve().then(() => setFolder(""));
  }, [open]);

  const submit = async (target: string | null) => {
    setSaving(true);
    try {
      await onConfirm(target);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {count} {count === 1 ? "asset" : "assets"}</DialogTitle>
          <DialogDescription>
            Choose an existing folder, type a new one, or move to Uncategorized.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {folders.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {folders.map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={folder === f ? "default" : "outline"}
                  onClick={() => setFolder(f)}
                >
                  {f}
                </Button>
              ))}
            </div>
          )}
          <div>
            <Label htmlFor="new-folder" className="text-xs">New or custom folder</Label>
            <Input
              id="new-folder"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="e.g. Marketing 2026"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => submit(null)} disabled={saving}>
            Move to Uncategorized
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => submit(folder.trim() || null)} disabled={saving || !folder.trim()}>
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
