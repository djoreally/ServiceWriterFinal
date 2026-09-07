import { z } from "zod";
import { ApiError, errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { dispatchLifecycleEvent, LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";

const schema = z.object({ workspace_id: z.string().uuid(), service_record_id: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner","admin","manager","service_advisor","receptionist"], request);

    const { data: serviceRecord, error: serviceError } = await supabase
      .from("service_records")
      .select("id,workspace_id,customer_id,appointment_id,status,work_performed")
      .eq("workspace_id", body.workspace_id)
      .eq("id", body.service_record_id)
      .single();
    if (serviceError || !serviceRecord) throw serviceError ?? new ApiError(404,"Service record not found","not_found");
    if (serviceRecord.status !== "completed") throw new ApiError(409,"Review requests are available after service completion.","service_not_completed");
    if (!serviceRecord.customer_id) throw new ApiError(409,"Completed service is not linked to a customer.","customer_required");

    const [{ data: customer, error: customerError }, { data: appointment }, { data: settings }, { data: workspace }] = await Promise.all([
      supabase.from("customers").select("id,email,first_name,last_name").eq("workspace_id",body.workspace_id).eq("id",serviceRecord.customer_id).single(),
      serviceRecord.appointment_id ? supabase.from("appointments").select("id,metadata").eq("workspace_id",body.workspace_id).eq("id",serviceRecord.appointment_id).maybeSingle() : Promise.resolve({ data:null }),
      supabase.from("workspace_settings").select("operational_settings").eq("workspace_id",body.workspace_id).maybeSingle(),
      supabase.from("workspaces").select("name").eq("id",body.workspace_id).single(),
    ]);
    if (customerError || !customer?.email) throw customerError ?? new ApiError(422,"Customer email is required.","customer_email_required");

    const operational = (settings?.operational_settings ?? {}) as Record<string,unknown>;
    const reviewUrl = typeof operational.google_review_url === "string" ? operational.google_review_url.trim() : "";
    if (!reviewUrl) throw new ApiError(409,"Configure a Google review URL before sending review requests.","review_url_missing");
    const ownerUserId = typeof operational.source_owner_user_id === "string" ? operational.source_owner_user_id : "";
    if (!ownerUserId) throw new ApiError(409,"Workspace messaging preferences are not configured.","preferences_owner_missing");

    const appointmentMetadata = (appointment?.metadata ?? {}) as Record<string,unknown>;
    const confirmationCode = typeof appointmentMetadata.confirmation_code === "string" && appointmentMetadata.confirmation_code
      ? appointmentMetadata.confirmation_code
      : (serviceRecord.appointment_id ?? serviceRecord.id).replace(/-/g,"").slice(0,8).toUpperCase();
    const preferences = new URL("https://www.servicewriter.xyz/messaging-preferences");
    preferences.searchParams.set("user_id", ownerUserId);
    preferences.searchParams.set("email", String(customer.email));

    const eventId = `review:${serviceRecord.id}`;
    const result = await dispatchLifecycleEvent({
      templateKey: LIFECYCLE_EVENT_KEYS.reviewRequest,
      eventId,
      entityType: "service_record",
      entityId: serviceRecord.id,
      workspaceId: body.workspace_id,
      recipientEmail: String(customer.email),
      recipientRole: "customer",
      customerId: serviceRecord.customer_id,
      variables: {
        "business.name": workspace?.name ?? "Service Writer",
        "appointment.confirmation_code": confirmationCode,
        "email.primary_action_url": reviewUrl,
        "email.preferences_url": preferences.toString(),
      },
      metadata: { serviceRecordId: serviceRecord.id, appointmentId: serviceRecord.appointment_id ?? "" },
    });

    const admin = createSupabaseAdminClient();
    const { error: activityError } = await admin.from("crm_activities").upsert({
      workspace_id: body.workspace_id,
      customer_id: serviceRecord.customer_id,
      appointment_id: serviceRecord.appointment_id,
      activity_type: "review",
      summary: `Review request ${result.status}`,
      occurred_at: new Date().toISOString(),
      created_by: user.id,
      source_event_id: eventId,
    }, { onConflict: "workspace_id,source_event_id" });
    if (activityError) throw activityError;

    return json({ data: { status: result.status, event_id: eventId } });
  } catch (error) {
    return errorResponse(error);
  }
}
