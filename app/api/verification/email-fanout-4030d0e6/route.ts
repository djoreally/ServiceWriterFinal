import { createSupabaseAdminClient } from "@/lib/supabase";
import { json } from "@/server/api";
import { sendBookingConfirmation } from "@/server/messaging/booking-confirmation";
import { processLifecycleEventOutbox } from "@/server/messaging/lifecycle-sender";

const APPOINTMENT_ID = "4030d0e6-e2fb-4375-9e15-77c5df49690c";
const WORKSPACE_ID = "250c258f-fad6-46e1-86de-3de41a7d4e1a";
const RECIPIENT_EMAIL = "djoreally@gmail.com";

export async function GET(request: Request) {
  const admin = createSupabaseAdminClient();
  const { data: appointment, error } = await admin
    .from("appointments")
    .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata")
    .eq("id", APPOINTMENT_ID)
    .eq("workspace_id", WORKSPACE_ID)
    .single();
  if (error || !appointment) return json({ error: "verification fixture not found" }, { status: 404 });

  const metadata = appointment.metadata && typeof appointment.metadata === "object" && !Array.isArray(appointment.metadata)
    ? appointment.metadata as Record<string, unknown>
    : {};
  if (metadata.verification_fixture !== true) return json({ error: "not a verification fixture" }, { status: 403 });
  if (metadata.email_test_sent_at) return json({ error: "verification already sent" }, { status: 409 });

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("name,timezone")
    .eq("id", WORKSPACE_ID)
    .single();
  if (workspaceError || !workspace) return json({ error: "workspace not found" }, { status: 404 });

  const result = await sendBookingConfirmation({
    appointment,
    workspaceName: workspace.name ?? "Service Writer",
    workspaceTimezone: workspace.timezone ?? "UTC",
    recipientEmail: RECIPIENT_EMAIL,
    actionUrl: new URL(`/appointments/${APPOINTMENT_ID}`, request.url).toString(),
  });

  const worker = await processLifecycleEventOutbox(10, `verification:${APPOINTMENT_ID}`);

  await admin.from("appointments").update({
    metadata: { ...metadata, email_test_sent_at: new Date().toISOString() },
  }).eq("id", APPOINTMENT_ID).eq("workspace_id", WORKSPACE_ID);

  return json({
    data: {
      queued_status: result.status,
      provider_message_id: result.providerMessageId,
      worker,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
