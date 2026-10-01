/**
 * Campaign Commands — Write operations for email marketing campaigns.
 * Customer audience resolution is canonical and workspace-scoped.
 */
import { apiClient } from "@/lib/api-client";
import type { CampaignRow } from "@/application/queries/campaigns.query";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { fetchCustomerAnalytics } from "@/application/queries/reports-tabs.query";

async function requireUser() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

async function requireWorkspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return context.workspaceId;
}

export interface CreateCampaignPayload {
  name: string;
  subject: string;
  content: string;
  recipient_type: string;
  scheduled_at: string | null;
  recipient_ids?: string[] | null;
}

interface CampaignRecipient {
  id: string;
  name: string;
  email: string;
}

export class CampaignValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignValidationError";
  }
}

async function fetchSegmentCustomerIds(segmentName: string): Promise<string[]> {
  const analytics = await fetchCustomerAnalytics("");
  return analytics.customers
    .filter((row) => (row.customer_segment || "").toLowerCase() === segmentName.toLowerCase())
    .map((row) => row.id);
}

export async function resolveRecipients(
  campaign: CampaignRow,
  defaultAudienceFn: (recipientType: string) => Promise<CampaignRecipient[]>,
): Promise<CampaignRecipient[]> {
  const overrideIds = campaign.recipient_ids ?? null;
  if (overrideIds !== null && overrideIds.length === 0) {
    throw new CampaignValidationError(
      `Campaign "${campaign.name}" has an empty recipient override. Either add recipients or remove the override.`,
    );
  }
  // Server resolves both recipient-id overrides and recipient_type audiences.
  const workspaceId = await requireWorkspaceId();
  const { data } = await apiClient.get<{ data: CampaignRecipient[] }>("/v1/crm/marketing/recipients", {
    query: {
      workspace_id: workspaceId,
      recipient_type: campaign.recipient_type,
      ...(overrideIds ? { override_ids: overrideIds.join(",") } : {}),
    },
  });
  if (overrideIds !== null && data.length === 0) {
    throw new CampaignValidationError(`Campaign "${campaign.name}" has no deliverable recipients in override.`);
  }
  return data;
}

export async function previewCampaignRecipients(recipientType: string): Promise<CampaignRecipient[]> {
  await requireUser();
  return fetchCampaignRecipients(recipientType);
}

async function fetchCampaignRecipients(recipientType: string): Promise<CampaignRecipient[]> {
  const workspaceId = await requireWorkspaceId();
  const segmentCustomerIds = recipientType?.startsWith("segment:")
    ? await fetchSegmentCustomerIds(recipientType.slice("segment:".length).trim())
    : [];
  const { data } = await apiClient.get<{ data: CampaignRecipient[] }>("/v1/crm/marketing/recipients", {
    query: {
      workspace_id: workspaceId,
      recipient_type: recipientType,
      ...(segmentCustomerIds.length ? { segment_customer_ids: segmentCustomerIds.join(",") } : {}),
    },
  });
  return data;
}

export async function createCampaign(payload: CreateCampaignPayload): Promise<void> {
  await requireUser();
  await apiClient.post("/v1/crm/marketing/email-campaigns", {
    name: payload.name,
    subject: payload.subject,
    content: payload.content,
    recipient_type: payload.recipient_type,
    scheduled_at: payload.scheduled_at,
    recipient_ids: payload.recipient_ids ?? null,
  });
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  await apiClient.delete(`/v1/crm/marketing/email-campaigns/${campaignId}`);
}

export async function sendCampaign(campaign: CampaignRow): Promise<number> {
  await requireUser();
  const workspaceId = await requireWorkspaceId();
  const segmentCustomerIds = campaign.recipient_type?.startsWith("segment:")
    ? await fetchSegmentCustomerIds(campaign.recipient_type.slice("segment:".length).trim())
    : [];
  const { data } = await apiClient.post<{ data: { sent: number } }>(
    `/v1/crm/marketing/email-campaigns/${campaign.id}/send`,
    {
      recipient_ids: campaign.recipient_ids ?? null,
      recipient_type: campaign.recipient_type,
      segment_customer_ids: segmentCustomerIds,
    },
    { query: { workspace_id: workspaceId } },
  );
  return data.sent;
}

export async function fetchCampaignAudienceSize(recipientType: string): Promise<number> {
  await requireUser();
  const customers = await fetchCampaignRecipients(recipientType);
  return customers.length;
}

export async function sendCampaignTest(campaign: CampaignRow, to: string): Promise<void> {
  await requireUser();
  await apiClient.post(`/v1/crm/marketing/email-campaigns/${campaign.id}/test`, { to });
}
