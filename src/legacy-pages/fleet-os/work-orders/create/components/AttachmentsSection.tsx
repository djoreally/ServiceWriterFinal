import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Paperclip, Trash2, Upload, ExternalLink } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  deleteDraftAttachment,
  listDraftAttachments,
  uploadDraftAttachment,
  type DraftAttachment,
} from "@/application/commands/fleet-wo-attachments.command";

interface Props {
  draftId: string | null;
  onRequireDraft?: () => Promise<string | null>;
}

function humanSize(n: number | null | undefined) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const AttachmentsSection = ({ draftId, onRequireDraft }: Props) => {
  const [rows, setRows] = useState<DraftAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!draftId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listDraftAttachments(draftId)
      .then((r) => !cancelled && setRows(r))
      .catch((e) => console.error("[AttachmentsSection] list", e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [draftId]);

  const handlePick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      let id = draftId;
      if (!id && onRequireDraft) id = await onRequireDraft();
      if (!id) {
        toast.error("Fill in a customer first to attach files.");
        return;
      }
      for (const file of Array.from(files)) {
        try {
          const row = await uploadDraftAttachment(id, file);
          setRows((prev) => [row, ...prev]);
        } catch (e) {
          console.error("[AttachmentsSection] upload", e);
          toast.error(`Failed to upload ${file.name}`);
        }
      }
      // Refresh signed URLs
      const refreshed = await listDraftAttachments(id);
      setRows(refreshed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (row: DraftAttachment) => {
    setBusy(true);
    try {
      await deleteDraftAttachment(row);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      console.error("[AttachmentsSection] delete", e);
      toast.error("Failed to remove attachment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-sky-500" /> 8. Attachments
        </CardTitle>
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handlePick(e.target.files)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1" /> Upload
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No attachments yet. Add POs, quotes, photos, or emails to keep this draft self-contained.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.label || "Untitled"}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.mime_type || "file"} · {humanSize(r.size_bytes)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {r.signed_url && (
                    <a href={r.signed_url} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => handleDelete(r)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
