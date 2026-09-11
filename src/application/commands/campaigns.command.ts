/**
 * Campaign Commands — Write operations for email marketing campaigns.
 * Customer audience resolution is canonical and workspace-scoped.
 */
import { supabase } from "@/integrations/supabase/client";
import { subMonths } from "date-fns";
import { CampaignStatus, EmailQueueStatus } from "@/lib/enums";
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

interface CampaignBusinessProfile {
  business_name: string | null;
  email: string | null;
  booking_slug: string | null;
}

export class CampaignValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignValidationError";
  }
}

async function fetchCanonicalCustomers(workspaceId: string): Promise<CampaignRecipient[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id,first_name,last_name,company_name,email")
    .eq("workspace_id", workspaceId)
    .not("email", "is", null);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => Boolean(row.email))
    .map((row) => ({
      id: String(row.id),
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
      email: String(row.email),
    }));
}

export async function resolveRecipients(
  campaign: CampaignRow,
  defaultAudienceFn: (recipientType: string) => Promise<CampaignRecipient[]>,
): Promise<CampaignRecipient[]> {
  const overrideIds = campaign.recipient_ids ?? null;
  if (overrideIds !== null) {
    if (overrideIds.length === 0) {
      throw new CampaignValidationError(
        `Campaign "${campaign.name}" has an empty recipient override. Either add recipients or remove the override.`,
      );
    }
    const workspaceId = await requireWorkspaceId();
    const { data, error } = await supabase
      .from("customers")
      .select("id,first_name,last_name,company_name,email")
      .eq("workspace_id", workspaceId)
      .in("id", overrideIds)
      .not("email", "is", null);
    if (error) throw error;
    const recipients: CampaignRecipient[] = (data ?? []).filter((row) => Boolean(row.email)).map((row) => ({
      id: String(row.id),
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
      email: String(row.email),
    }));
    if (recipients.length === 0) {
      throw new CampaignValidationError(`Campaign "${campaign.name}" has no deliverable recipients in override.`);
    }
    return recipients;
  }
  return defaultAudienceFn(campaign.recipient_type);
}

export async function previewCampaignRecipients(recipientType: string): Promise<CampaignRecipient[]> {
  await requireUser();
  return fetchCampaignRecipients(recipientType);
}

async function fetchCampaignRecipients(recipientType: string): Promise<CampaignRecipient[]> {
  const workspaceId = await requireWorkspaceId();
  let customers = await fetchCanonicalCustomers(workspaceId);

  if (recipientType?.startsWith("segment:")) {
    const segmentName = recipientType.slice("segment:".length).trim().toLowerCase();
    const analytics = await fetchCustomerAnalytics("");
    const matchingIds = new Set(
      analytics.customers
        .filter((row) => (row.customer_segment || "").toLowerCase() === segmentName)
        .map((row) => row.id),
    );
    customers = customers.filter((customer) => matchingIds.has(customer.id));
  } else if (recipientType === "recent" || recipientType === "inactive") {
    const cutoff = subMonths(new Date(), recipientType === "recent" ? 3 : 6).toISOString();
    const { data, error } = await supabase
      .from("appointments")
      .select("customer_id")
      .eq("workspace_id", workspaceId)
      .gte("starts_at", cutoff);
    if (error) throw error;
    const activeIds = new Set((data ?? []).map((row) => row.customer_id).filter(Boolean));
    customers = recipientType === "recent"
      ? customers.filter((customer) => activeIds.has(customer.id))
      : customers.filter((customer) => !activeIds.has(customer.id));
  }

  return customers;
}

async function fetchCampaignBusinessProfile(userId: string): Promise<CampaignBusinessProfile | null> {
  const { data, error } = await supabase
    .from("business_profiles")
    .select("business_name, email, booking_slug")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function filterSuppressedMarketingRecipients(
  userId: string,
  recipients: CampaignRecipient[],
): Promise<CampaignRecipient[]> {
  void userId;
  return recipients;
}

function assertMarketingEmailEntitlement(
  _profile: CampaignBusinessProfile | null,
  _recipientCount: number,
) {}

export async function createCampaign(payload: CreateCampaignPayload): Promise<void> {
  const user = await requireUser();
  const { error } = await supabase
    .from("email_marketing_campaigns")
    .insert({
      user_id: user.id,
      ...payload,
      status: payload.scheduled_at ? CampaignStatus.Scheduled : CampaignStatus.Draft,
    });
  if (error) throw error;
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const { error } = await supabase
    .from("email_marketing_campaigns")
    .delete()
    .eq("id", campaignId);
  if (error) throw error;
}

export async function sendCampaign(campaign: CampaignRow): Promise<number> {
  const user = await requireUser();
  const customers = await resolveRecipients(campaign, (recipientType) => fetchCampaignRecipients(recipientType));
  if (!customers.length) throw new Error("No customers matching the criteria found");

  const businessProfile = await fetchCampaignBusinessProfile(user.id);
  assertMarketingEmailEntitlement(businessProfile, customers.length);
  const deliverableCustomers = await filterSuppressedMarketingRecipients(user.id, customers);
  if (!deliverableCustomers.length) {
    throw new CampaignValidationError("All matching recipients are unsubscribed or suppressed from marketing email.");
  }

  const emailQueue = deliverableCustomers.map((customer) => ({
    user_id: user.id,
    customer_id: customer.id,
    campaign_id: campaign.id,
    email_type: "promotional",
    recipient_email: customer.email,
    recipient_name: customer.name,
    scheduled_for: new Date().toISOString(),
    status: EmailQueueStatus.Pending,
    source: "campaign_manager",
    metadata: {
      campaignId: campaign.id,
      subject: campaign.subject,
      content: campaign.content,
      service_name: campaign.subject,
      service_description: campaign.content,
      businessName: businessProfile?.business_name || "Your Auto Shop",
      business_name: businessProfile?.business_name || "Your Auto Shop",
      business_email: businessProfile?.email || undefined,
      bookingSlug: businessProfile?.booking_slug,
      booking_slug: businessProfile?.booking_slug,
    },
  }));

  const { error: queueError } = await supabase.from("email_queue").insert(emailQueue);
  if (queueError) throw queueError;

  await supabase
    .from("email_marketing_campaigns")
    .update({ status: CampaignStatus.Sent, sent_at: new Date().toISOString(), recipient_count: deliverableCustomers.length })
    .eq("id", campaign.id);

  return deliverableCustomers.length;
}

export async function fetchCampaignAudienceSize(recipientType: string): Promise<number> {
  await requireUser();
  const customers = await fetchCampaignRecipients(recipientType);
  return customers.length;
}

export async function sendCampaignTest(campaign: CampaignRow, to: string): Promise<void> {
  const user = await requireUser();
  const businessProfile = await fetchCampaignBusinessProfile(user.id);
  const response = await supabase.functions.invoke("send-email", {
    body: {
      source: "campaign_manager_test",
      to,
      type: "promotional",
      campaign_id: campaign.id,
      customerName: "Test Customer",
      businessName: businessProfile?.business_name || "Your Auto Shop",
      businessEmail: businessProfile?.email || undefined,
      serviceName: campaign.subject,
      serviceDescription: campaign.content,
      bookingSlug: businessProfile?.booking_slug || undefined,
    },
  });
  if (response.error) throw response.error;
}
