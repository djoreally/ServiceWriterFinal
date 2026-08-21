/**
 * Campaign Commands — Write operations for email marketing campaigns.
 */
import { supabase } from "@/integrations/supabase/client";
import { subMonths } from "date-fns";
import { CampaignStatus, EmailQueueStatus } from "@/lib/enums";
import type { CampaignRow } from "@/application/queries/campaigns.query";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
async function requireUser() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  return user;
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

export async function resolveRecipients(
  campaign: CampaignRow,
  defaultAudienceFn: (recipientType: string) => Promise<CampaignRecipient[]>,
): Promise<CampaignRecipient[]> {
  const overrideIds = campaign.recipient_ids ?? null;

  // null => no override, use default audience
  if (overrideIds !== null) {
    // [] => explicit override to nobody, which is invalid for send.
    if (overrideIds.length === 0) {
      throw new CampaignValidationError(
        `Campaign "${campaign.name}" has an empty recipient override. Either add recipients or remove the override.`,
      );
    }

    const user = await requireUser();
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, email")
      .eq("user_id", user.id)
      .in("id", overrideIds)
      .not("email", "is", null);
    if (error) throw error;

    const recipients = (data ?? []).filter((c): c is CampaignRecipient => Boolean(c.email));
    if (recipients.length === 0) {
      throw new CampaignValidationError(`Campaign "${campaign.name}" has no deliverable recipients in override.`);
    }
    return recipients;
  }

  return defaultAudienceFn(campaign.recipient_type);
}

/**
 * Resolve the full recipient list for a campaign — used both for previewing
 * before save and as the source of truth when audience type is dynamic.
 */
export async function previewCampaignRecipients(recipientType: string): Promise<CampaignRecipient[]> {
  const user = await requireUser();
  return fetchCampaignRecipients(user.id, recipientType);
}

async function fetchCampaignRecipients(userId: string, recipientType: string): Promise<CampaignRecipient[]> {
  let query = supabase
    .from("customers")
    .select("id, name, email")
    .eq("user_id", userId)
    .not("email", "is", null);

  if (recipientType?.startsWith("segment:")) {
    const segmentName = recipientType.slice("segment:".length);
    query = query.eq("customer_segment", segmentName);
  } else if (recipientType === "recent") {
    const threeMonthsAgo = subMonths(new Date(), 3).toISOString();
    const { data: recentCustomers, error } = await supabase
      .from("appointments")
      .select("customer_id")
      .eq("user_id", userId)
      .gte("scheduled_date", threeMonthsAgo);

    if (error) throw error;

    const ids = [...new Set((recentCustomers ?? []).map((row) => row.customer_id).filter(Boolean))];
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  } else if (recipientType === "inactive") {
    const sixMonthsAgo = subMonths(new Date(), 6).toISOString();
    const { data: activeCustomers, error } = await supabase
      .from("appointments")
      .select("customer_id")
      .eq("user_id", userId)
      .gte("scheduled_date", sixMonthsAgo);

    if (error) throw error;

    const ids = [...new Set((activeCustomers ?? []).map((row) => row.customer_id).filter(Boolean))];
    if (ids.length > 0) {
      // Supabase PostgREST typings for chained `.not()` are lost after the initial select;
      // narrow to a filter-capable shape rather than `any` to keep typed-lint happy.
      const filterable = query as unknown as {
        not: (column: string, op: string, value: string) => typeof query;
      };
      query = filterable.not("id", "in", `(${ids.join(",")})`);
    }
  }

  const { data: customers, error } = await query;
  if (error) throw error;

  return (customers ?? []).filter((customer): customer is CampaignRecipient => Boolean(customer.email));
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
  // Email subscription suppression list is not yet implemented in the schema.
  void userId;
  return recipients;
}

function assertMarketingEmailEntitlement(
  _profile: CampaignBusinessProfile | null,
  _recipientCount: number,
) {
  // Marketing email entitlement columns are not present on business_profiles yet.
}


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
  const customers = await resolveRecipients(campaign, (recipientType) => fetchCampaignRecipients(user.id, recipientType));
  if (!customers || customers.length === 0) {
    throw new Error("No customers matching the criteria found");
  }

  const businessProfile = await fetchCampaignBusinessProfile(user.id);
  assertMarketingEmailEntitlement(businessProfile, customers.length);

  const deliverableCustomers = await filterSuppressedMarketingRecipients(user.id, customers);
  if (deliverableCustomers.length === 0) {
    throw new CampaignValidationError("All matching recipients are unsubscribed or suppressed from marketing email.");
  }
  assertMarketingEmailEntitlement(businessProfile, deliverableCustomers.length);

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

  const { error: queueError } = await supabase
    .from("email_queue")
    .insert(emailQueue);
  if (queueError) throw queueError;

  await supabase
    .from("email_marketing_campaigns")
    .update({
      status: CampaignStatus.Sent,
      sent_at: new Date().toISOString(),
      recipient_count: deliverableCustomers.length,
    })
    .eq("id", campaign.id);

  // Marketing email usage counter is not yet tracked on business_profiles.


  return deliverableCustomers.length;
}

export async function fetchCampaignAudienceSize(recipientType: string): Promise<number> {
  const user = await requireUser();
  const customers = await fetchCampaignRecipients(user.id, recipientType);
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
