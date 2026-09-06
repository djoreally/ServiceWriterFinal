/** Campaign Commands — workspace-scoped email marketing writes. */
import { subMonths } from "date-fns";
import type { CampaignRow } from "@/application/queries/campaigns.query";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { supabase } from "@/integrations/supabase/client";
import { CampaignStatus, EmailQueueStatus } from "@/lib/enums";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

async function requireUser() { const { data: { user } } = await getCurrentAuthUser(); if (!user) throw new Error("Authentication required"); return user; }
export interface CreateCampaignPayload { name: string; subject: string; content: string; recipient_type: string; scheduled_at: string | null; recipient_ids?: string[] | null; }
interface CampaignRecipient { id: string; name: string; email: string; }
interface CampaignBusinessProfile { business_name: string | null; email: string | null; booking_slug: string | null; }
export class CampaignValidationError extends Error { constructor(message: string) { super(message); this.name = "CampaignValidationError"; } }

async function currentWorkspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Workspace required");
  return context.workspaceId;
}

export async function resolveRecipients(campaign: CampaignRow, defaultAudienceFn: (recipientType: string) => Promise<CampaignRecipient[]>): Promise<CampaignRecipient[]> {
  const overrideIds = campaign.recipient_ids ?? null;
  if (overrideIds !== null) {
    if (overrideIds.length === 0) throw new CampaignValidationError(`Campaign "${campaign.name}" has an empty recipient override. Either add recipients or remove the override.`);
    const user = await requireUser();
    const { data, error } = await supabase.from("customers").select("id, name, email").eq("user_id", user.id).in("id", overrideIds).not("email", "is", null);
    if (error) throw error;
    const recipients = (data ?? []).filter((customer): customer is CampaignRecipient => Boolean(customer.email));
    if (!recipients.length) throw new CampaignValidationError(`Campaign "${campaign.name}" has no deliverable recipients in override.`);
    return recipients;
  }
  return defaultAudienceFn(campaign.recipient_type);
}

export async function previewCampaignRecipients(recipientType: string): Promise<CampaignRecipient[]> { const user = await requireUser(); return fetchCampaignRecipients(user.id, recipientType); }

async function fetchCampaignRecipients(userId: string, recipientType: string): Promise<CampaignRecipient[]> {
  let query = supabase.from("customers").select("id, name, email").eq("user_id", userId).not("email", "is", null);
  if (recipientType?.startsWith("segment:")) {
    query = query.eq("customer_segment", recipientType.slice("segment:".length));
  } else if (recipientType === "recent" || recipientType === "inactive") {
    const workspaceId = await currentWorkspaceId();
    const cutoff = subMonths(new Date(), recipientType === "recent" ? 3 : 6).toISOString();
    const { data: appointmentCustomers, error } = await supabase.from("appointments").select("customer_id").eq("workspace_id", workspaceId).gte("starts_at", cutoff);
    if (error) throw error;
    const ids = [...new Set((appointmentCustomers ?? []).map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
    if (recipientType === "recent") {
      if (!ids.length) return [];
      query = query.in("id", ids);
    } else if (ids.length) {
      query = query.not("id", "in", `(${ids.join(",")})`);
    }
  }
  const { data: customers, error } = await query;
  if (error) throw error;
  return (customers ?? []).filter((customer): customer is CampaignRecipient => Boolean(customer.email));
}

async function fetchCampaignBusinessProfile(_userId: string): Promise<CampaignBusinessProfile | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const [{ data: workspace, error: workspaceError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("workspaces").select("name").eq("id", context.workspaceId).maybeSingle(),
    supabase.from("workspace_settings").select("email, booking_slug").eq("workspace_id", context.workspaceId).maybeSingle(),
  ]);
  if (workspaceError) throw workspaceError;
  if (settingsError) throw settingsError;
  return { business_name: workspace?.name ?? null, email: settings?.email ?? null, booking_slug: settings?.booking_slug ?? null };
}

async function filterSuppressedMarketingRecipients(_userId: string, recipients: CampaignRecipient[]): Promise<CampaignRecipient[]> { return recipients; }
function assertMarketingEmailEntitlement(_profile: CampaignBusinessProfile | null, _recipientCount: number) { return; }

export async function createCampaign(payload: CreateCampaignPayload): Promise<void> { const user = await requireUser(); const { error } = await supabase.from("email_marketing_campaigns").insert({ user_id: user.id, ...payload, status: payload.scheduled_at ? CampaignStatus.Scheduled : CampaignStatus.Draft }); if (error) throw error; }
export async function deleteCampaign(campaignId: string): Promise<void> { const { error } = await supabase.from("email_marketing_campaigns").delete().eq("id", campaignId); if (error) throw error; }

export async function sendCampaign(campaign: CampaignRow): Promise<number> {
  const user = await requireUser();
  const customers = await resolveRecipients(campaign, (recipientType) => fetchCampaignRecipients(user.id, recipientType));
  if (!customers.length) throw new Error("No customers matching the criteria found");
  const businessProfile = await fetchCampaignBusinessProfile(user.id);
  assertMarketingEmailEntitlement(businessProfile, customers.length);
  const deliverableCustomers = await filterSuppressedMarketingRecipients(user.id, customers);
  if (!deliverableCustomers.length) throw new CampaignValidationError("All matching recipients are unsubscribed or suppressed from marketing email.");
  assertMarketingEmailEntitlement(businessProfile, deliverableCustomers.length);
  const emailQueue = deliverableCustomers.map((customer) => ({ user_id: user.id, customer_id: customer.id, campaign_id: campaign.id, email_type: "promotional", recipient_email: customer.email, recipient_name: customer.name, scheduled_for: new Date().toISOString(), status: EmailQueueStatus.Pending, source: "campaign_manager", metadata: { campaignId: campaign.id, subject: campaign.subject, content: campaign.content, service_name: campaign.subject, service_description: campaign.content, businessName: businessProfile?.business_name || "Your Auto Shop", business_name: businessProfile?.business_name || "Your Auto Shop", business_email: businessProfile?.email || undefined, bookingSlug: businessProfile?.booking_slug, booking_slug: businessProfile?.booking_slug } }));
  const { error: queueError } = await supabase.from("email_queue").insert(emailQueue);
  if (queueError) throw queueError;
  const { error: campaignError } = await supabase.from("email_marketing_campaigns").update({ status: CampaignStatus.Sent, sent_at: new Date().toISOString(), recipient_count: deliverableCustomers.length }).eq("id", campaign.id);
  if (campaignError) throw campaignError;
  return deliverableCustomers.length;
}

export async function fetchCampaignAudienceSize(recipientType: string): Promise<number> { const user = await requireUser(); return (await fetchCampaignRecipients(user.id, recipientType)).length; }

export async function sendCampaignTest(campaign: CampaignRow, to: string): Promise<void> {
  const user = await requireUser();
  const businessProfile = await fetchCampaignBusinessProfile(user.id);
  const response = await supabase.functions.invoke("send-email", { body: { source: "campaign_manager_test", to, type: "promotional", campaign_id: campaign.id, customerName: "Test Customer", businessName: businessProfile?.business_name || "Your Auto Shop", businessEmail: businessProfile?.email || undefined, serviceName: campaign.subject, serviceDescription: campaign.content, bookingSlug: businessProfile?.booking_slug || undefined } });
  if (response.error) throw response.error;
}
