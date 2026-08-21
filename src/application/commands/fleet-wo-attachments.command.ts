/**
 * Fleet Work Order Draft Attachments — upload/list/delete files linked to a draft.
 * Files live in the private `fleet-wo-attachments` bucket under `${user_id}/${draft_id}/`.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface DraftAttachment {
  id: string;
  draft_id: string;
  storage_path: string;
  label: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  signed_url?: string | null;
}

const BUCKET = "fleet-wo-attachments";

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be signed in.");
  return user.id;
}

export async function listDraftAttachments(draftId: string): Promise<DraftAttachment[]> {
  const { data, error } = await supabase
    .from("fleet_work_order_draft_attachments")
    .select("id, draft_id, storage_path, label, mime_type, size_bytes, created_at")
    .eq("draft_id", draftId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as DraftAttachment[];
  // Best-effort signed URLs (60 min).
  const paths = rows.map((r) => r.storage_path);
  if (paths.length === 0) return rows;
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
  const urlByPath = new Map((signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? null] as const));
  return rows.map((r) => ({ ...r, signed_url: urlByPath.get(r.storage_path) ?? null }));
}

export async function uploadDraftAttachment(
  draftId: string,
  file: File,
  label?: string,
): Promise<DraftAttachment> {
  const userId = await requireUserId();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const storage_path = `${userId}/${draftId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storage_path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("fleet_work_order_draft_attachments")
    .insert({
      draft_id: draftId,
      user_id: userId,
      storage_path,
      label: label ?? file.name,
      mime_type: file.type || null,
      size_bytes: file.size ?? null,
    })
    .select("id, draft_id, storage_path, label, mime_type, size_bytes, created_at")
    .single();
  if (error) throw error;
  return data as DraftAttachment;
}

export async function deleteDraftAttachment(row: DraftAttachment): Promise<void> {
  await supabase.storage.from(BUCKET).remove([row.storage_path]);
  const { error } = await supabase
    .from("fleet_work_order_draft_attachments")
    .delete()
    .eq("id", row.id);
  if (error) throw error;
}
