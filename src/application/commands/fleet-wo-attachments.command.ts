/**
 * Fleet Work Order Draft Attachments — upload/list/delete files linked to a draft.
 * Files live in the private `fleet-wo-attachments` bucket under `${user_id}/${draft_id}/`.
 */

import { apiClient } from "@/lib/api-client";

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

async function requireUserId(): Promise<string> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be signed in.");
  return user.id;
}

export async function listDraftAttachments(draftId: string): Promise<DraftAttachment[]> {
  const { data } = await apiClient.get<{ data: DraftAttachment[] }>(
    `/v1/fleet/work-order-drafts/${draftId}/attachments`,
  );
  return data ?? [];
}

export async function uploadDraftAttachment(
  draftId: string,
  file: File,
  label?: string,
): Promise<DraftAttachment> {
  await requireUserId();

  const form = new FormData();
  form.append("file", file, file.name);
  if (label !== undefined) form.append("label", label);

  const { data } = await apiClient.post<{ data: DraftAttachment }>(
    `/v1/fleet/work-order-drafts/${draftId}/attachments`,
    form,
  );
  return data;
}

export async function deleteDraftAttachment(row: DraftAttachment): Promise<void> {
  await apiClient.delete(`/v1/fleet/work-order-drafts/attachments/${row.id}`);
}
