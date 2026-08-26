import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutGrid, List, Search, Upload, FolderOpen, AlertTriangle } from "lucide-react";
import {
  safeListAssets,
  safeGetSignedUrl,
  verifyAssetsInfrastructure,
  type InfraStatus,
} from "@/lib/assets/safe";
import {
  deleteAsset,
  renameAsset,
  type AssetRecord,
} from "@/application/commands/assets.command";
import {
  bulkDeleteAssets,
  bulkMoveAssets,
  attachAssetsToService,
} from "@/application/commands/assets.bulk.command";
import { listAssetFolders } from "@/application/queries/service-assets.query";
import type { AssetType } from "@/lib/assets/validation";
import { useAssetUploads } from "@/hooks/useAssetUploads";
import { useAssetsRealtime } from "@/hooks/useAssetsRealtime";
import { AssetDropzone } from "./AssetDropzone";
import { AssetCard } from "./AssetCard";
import { AssetRow } from "./AssetRow";
import { UploadQueue } from "./UploadQueue";
import { AssetPreviewDialog } from "./AssetPreviewDialog";
import { BulkActionBar } from "./BulkActionBar";
import { MoveToFolderDialog } from "./MoveToFolderDialog";
import { AttachToServiceDialog } from "./AttachToServiceDialog";
import { fetchInternalInboxCurrentUserId } from "@/application/queries/internal-inbox.query";

type SortKey = "newest" | "oldest" | "name" | "size";
type View = "grid" | "list";

const ALL_FOLDERS = "__all__";
const UNCATEGORIZED = "__uncategorized__";

export function AssetsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetType | "all">("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<View>("grid");
  const [folderFilter, setFolderFilter] = useState<string>(ALL_FOLDERS);
  const [preview, setPreview] = useState<AssetRecord | null>(null);
  const [renameTarget, setRenameTarget] = useState<AssetRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AssetRecord | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const folderParam: string | null | undefined =
    folderFilter === ALL_FOLDERS
      ? undefined
      : folderFilter === UNCATEGORIZED
      ? null
      : folderFilter;

  const queryKey = useMemo(
    () => ["assets", { search, typeFilter, sort, folderParam }],
    [search, typeFilter, sort, folderParam],
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      safeListAssets({ search, assetType: typeFilter, sort, folder: folderParam, limit: 100 }),
    staleTime: 30_000,
    retry: 1,
  });

  const { data: folders = [] } = useQuery<string[]>({
    queryKey: ["asset-folders"],
    queryFn: async () => {
      try {
        return await listAssetFolders();
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const uploads = useAssetUploads(() => {
    void qc.invalidateQueries({ queryKey: ["assets"] });
  });

  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchInternalInboxCurrentUserId()
      .then((uid) => {
        if (!cancelled) setUserId(uid);
      })
      .catch(() => {
        if (!cancelled) setUserId(null);
      });
    return () => {
      cancelled = true;
    };

  }, []);

  const invalidateAssets = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["assets"] });
    void qc.invalidateQueries({ queryKey: ["asset-folders"] });
  }, [qc]);
  useAssetsRealtime(userId, invalidateAssets);

  const [infra, setInfra] = useState<InfraStatus>("unknown");
  useEffect(() => {
    let cancelled = false;
    verifyAssetsInfrastructure().then((status) => {
      if (!cancelled) setInfra(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopyLink = useCallback(async (a: AssetRecord) => {
    const url = await safeGetSignedUrl(a.storage_path, 3600);
    if (!url) {
      toast.error("Couldn't generate a shareable link. Try again.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Signed link copied (expires in 1 hour)");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }, []);

  const handleDownload = useCallback(async (a: AssetRecord) => {
    const url = await safeGetSignedUrl(a.storage_path, 600);
    if (!url) {
      toast.error("Couldn't prepare download. Try again.");
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = a.original_filename;
    link.rel = "noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  const submitRename = useCallback(async () => {
    if (!renameTarget) return;
    try {
      await renameAsset(renameTarget.id, renameValue);
      toast.success("Renamed");
      setRenameTarget(null);
      invalidateAssets();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [renameTarget, renameValue, invalidateAssets]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteAsset(deleteTarget.id);
      toast.success("Deleted");
      setDeleteTarget(null);
      invalidateAssets();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [deleteTarget, invalidateAssets]);

  const items = data?.items ?? [];

  // Selection helpers
  const toggleSelect = useCallback((asset: AssetRecord) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) next.delete(asset.id);
      else next.add(asset.id);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }, [items]);

  // Drop stale ids when the visible set changes
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(items.map((i) => i.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const handleBulkDelete = useCallback(async () => {
    setBulkBusy(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await bulkDeleteAssets(ids);
      if (res.failed.length) {
        toast.error(`Failed to delete ${res.failed.length} of ${ids.length} assets`);
      } else {
        toast.success(`Deleted ${ids.length} ${ids.length === 1 ? "asset" : "assets"}`);
      }
      clearSelection();
      setBulkDeleteOpen(false);
      invalidateAssets();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }, [selectedIds, clearSelection, invalidateAssets]);

  const handleBulkMove = useCallback(
    async (folder: string | null) => {
      setBulkBusy(true);
      try {
        const ids = Array.from(selectedIds);
        const res = await bulkMoveAssets(ids, folder);
        if (res.failed.length) {
          toast.error(`Failed to move ${res.failed.length} of ${ids.length} assets`);
        } else {
          toast.success(
            folder
              ? `Moved ${ids.length} to "${folder}"`
              : `Moved ${ids.length} to Uncategorized`,
          );
        }
        clearSelection();
        setMoveOpen(false);
        invalidateAssets();
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedIds, clearSelection, invalidateAssets],
  );

  const handleAttach = useCallback(
    async (serviceId: string) => {
      setBulkBusy(true);
      try {
        const ids = Array.from(selectedIds);
        const res = await attachAssetsToService(serviceId, ids);
        if (res.failed.length) {
          toast.error(`Failed to attach ${res.failed.length} of ${ids.length} assets`);
        } else {
          toast.success(
            `Attached ${ids.length} ${ids.length === 1 ? "asset" : "assets"} to service`,
          );
        }
        clearSelection();
        setAttachOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedIds, clearSelection],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">
            Private file library for your business — images, video, audio, and documents.
          </p>
        </div>
        <Button onClick={() => document.getElementById("assets-dropzone-input")?.click()}>
          <Upload className="mr-2 h-4 w-4" /> Upload
        </Button>
      </div>

      <div>
        <AssetDropzone onFiles={uploads.enqueue} compact inputId="assets-dropzone-input" />
      </div>

      {(data?.degraded || infra === "unavailable") && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span>
              {infra === "unavailable"
                ? "Asset storage is temporarily unavailable. Other parts of the app are unaffected."
                : "Couldn't load your library."}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      <BulkActionBar
        count={selectedIds.size}
        onClear={clearSelection}
        onDelete={() => setBulkDeleteOpen(true)}
        onMove={() => setMoveOpen(true)}
        onAttach={() => setAttachOpen(true)}
        disabled={bulkBusy}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="pl-8"
          />
        </div>
        <Select value={folderFilter} onValueChange={setFolderFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FOLDERS}>All folders</SelectItem>
            <SelectItem value={UNCATEGORIZED}>Uncategorized</SelectItem>
            {folders.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AssetType | "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="audio">Audio</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="size">Largest</SelectItem>
          </SelectContent>
        </Select>
        {items.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={selectedIds.size === items.length ? clearSelection : selectAllVisible}
          >
            {selectedIds.size === items.length ? "Clear" : "Select all"}
          </Button>
        )}
        <div className="flex rounded-md border overflow-hidden">
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="rounded-none h-9 w-9"
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            className="rounded-none h-9 w-9"
            onClick={() => setView("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No assets yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Drag files into the area above or click Upload to get started.
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {items.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              selected={selectedIds.has(asset.id)}
              onToggleSelect={toggleSelect}
              onPreview={setPreview}
              onRename={(a) => {
                setRenameTarget(a);
                setRenameValue(a.original_filename);
              }}
              onDelete={setDeleteTarget}
              onCopyLink={handleCopyLink}
              onDownload={handleDownload}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((asset) => (
            <AssetRow
              key={asset.id}
              asset={asset}
              selected={selectedIds.has(asset.id)}
              onToggleSelect={toggleSelect}
              onPreview={setPreview}
              onRename={(a) => {
                setRenameTarget(a);
                setRenameValue(a.original_filename);
              }}
              onDelete={setDeleteTarget}
              onCopyLink={handleCopyLink}
              onDownload={handleDownload}
            />
          ))}
        </div>
      )}

      <AssetPreviewDialog asset={preview} onOpenChange={(o) => !o && setPreview(null)} />

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename asset</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{deleteTarget?.original_filename}</strong>{" "}
              from your library. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.size} {selectedIds.size === 1 ? "asset" : "assets"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              These files will be removed from your library. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkBusy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MoveToFolderDialog
        open={moveOpen}
        count={selectedIds.size}
        onOpenChange={setMoveOpen}
        onConfirm={handleBulkMove}
      />

      <AttachToServiceDialog
        open={attachOpen}
        count={selectedIds.size}
        onOpenChange={setAttachOpen}
        onConfirm={handleAttach}
      />

      <UploadQueue
        items={uploads.items}
        onRetry={uploads.retry}
        onDismiss={uploads.dismiss}
        onClearCompleted={uploads.clearCompleted}
      />
    </div>
  );
}
