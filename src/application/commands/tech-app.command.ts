import { supabase } from "@/integrations/supabase/client";
import { fetchTechnicianIdByAuthUserId, getCurrentAuthUserId } from "@/application/queries/tech-app.query";
import { buildTransitionIdempotencyKey } from "@/lib/offline-transition-policy";
import { sendJobThreadHumanMessage } from "@/application/commands/job-thread.command";
import { normalizeTechNotificationPreferences, type TechnicianNotificationPreferences } from "@/lib/technician-notification-preferences";

export async function clockInCurrentTechnician() {
  return supabase.rpc("clock_in");
}

export async function clockOutCurrentTechnician() {
  return supabase.rpc("clock_out");
}

export async function signOutCurrentUser() {
  return supabase.auth.signOut();
}

export async function saveTechNotificationPreferences(preferences: Partial<TechnicianNotificationPreferences> | boolean) {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) return { error: "Not authenticated" };

  const normalized = typeof preferences === "boolean"
    ? normalizeTechNotificationPreferences({ pushNotificationsEnabled: preferences })
    : normalizeTechNotificationPreferences(preferences);

  const client = supabase as any;
  const { error } = await client
    .from("technician_notification_preferences")
    .upsert(
      {
        user_id: authUserId,
        push_notifications_enabled: normalized.pushNotificationsEnabled,
        dispatch_push_enabled: normalized.dispatchPushEnabled,
        customer_sms_enabled: normalized.customerSmsEnabled,
        customer_email_enabled: normalized.customerEmailEnabled,
        offline_cache_enabled: normalized.offlineCacheEnabled,
      },
      { onConflict: "user_id" },
    );

  return { error: error?.message ?? null };
}

/**
 * Applies a signed delta server-side so two devices adjusting the same van line
 * cannot clobber each other with a stale absolute quantity.
 */
/**
 * Van stock only ever moves through the ledger RPC. Every movement is an
 * append-only entry keyed by an idempotency key, so an offline replay cannot
 * double-count and two devices cannot clobber each other's quantity.
 */
export async function recordVanInventoryMovement(params: {
  vanInventoryId: string;
  entryType: "consume" | "waste" | "return" | "restock" | "adjust";
  quantity: number;
  idempotencyKey?: string;
  jobId?: string | null;
  jobSource?: string | null;
  note?: string | null;
}) {
  const idempotencyKey = params.idempotencyKey ?? crypto.randomUUID();
  const { data, error } = await (supabase as any).rpc("record_inventory_movement_v1", {
    p_van_inventory_id: params.vanInventoryId,
    p_entry_type: params.entryType,
    p_quantity: params.quantity,
    p_idempotency_key: idempotencyKey,
    p_job_id: params.jobId ?? null,
    p_job_source: params.jobSource ?? null,
    p_note: params.note ?? null,
  });

  return {
    quantity: (data?.quantity as number | undefined) ?? null,
    idempotencyKey,
    error: error?.message ?? null,
  };
}

export async function requestVanRestock(params: {
  vanId: string;
  items: Array<{ van_inventory_id: string; name: string; quantity: number }>;
  note?: string | null;
}) {
  const { data, error } = await (supabase as any).rpc("create_inventory_restock_request_v1", {
    p_van_id: params.vanId,
    p_items: params.items,
    p_note: params.note ?? null,
  });
  return { requestId: (data as string | null) ?? null, error: error?.message ?? null };
}

/**
 * Technician quick messages go through the job-thread outbox so every message is
 * attributed, participation-checked, and visible on one timeline. Direct
 * dispatch_events inserts (and any direct customer SMS path) are intentionally gone.
 */
export async function sendTechDispatchQuickMessage(
  appointmentId: string,
  notes: string,
  jobSource: "appointment" | "fleet_work_order" = "appointment",
) {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { error: new Error("Not authenticated") };
  }

  const trimmed = notes.trim();
  if (!trimmed) {
    return { error: new Error("Message cannot be empty") };
  }

  const { error } = await sendJobThreadHumanMessage({
    jobId: appointmentId,
    jobSource,
    content: trimmed,
    senderRole: "technician",
    channel: "dispatch",
  });

  return { error: error ? new Error(error) : null };
}

const TRANSITION_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "You are signed out. Sign in and try again.",
  not_authorized_for_job: "This job is not assigned to you.",
  job_not_found: "Job could not be found.",
  job_version_conflict: "Job state changed on another device/session. Refresh and retry.",
  invalid_job_source: "Unsupported job type.",
};

function mapTransitionError(raw: string): string {
  const code = Object.keys(TRANSITION_ERROR_MESSAGES).find((key) => raw.includes(key));
  if (code) return TRANSITION_ERROR_MESSAGES[code];
  if (raw.includes("checklist_incomplete")) {
    const count = raw.match(/checklist_incomplete_(\d+)/)?.[1];
    return `Required execution step${count === "1" ? "" : "s"} still open${count ? ` (${count})` : ""}. Finish them before completing.`;
  }
  if (raw.includes("invalid_transition")) {
    return "That status change is not allowed from the job's current state.";
  }
  if (raw.includes("ENFORCEMENT_ERROR")) {
    return raw.replace(/^.*ENFORCEMENT_ERROR:\s*/, "");
  }
  return raw;
}

/**
 * Single atomic transition path. Authorization, conflict detection, transition
 * validation, checklist/evidence validation, mutation, event creation, and
 * idempotency result storage all happen inside one server transaction — the
 * idempotency record is written LAST so a failed attempt cannot make a retry
 * look successful.
 */
export async function updateTechJobDispatchStatus(
  jobId: string,
  nextStatus: string,
  notes?: string,
  isFleet: boolean = false,
  options?: { idempotencyKey?: string; expectedUpdatedAt?: string | null },
): Promise<{ error: string | null; replayed?: boolean }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) return { error: "You are signed out. Sign in and try again." };

  const idempotencyKey = options?.idempotencyKey || buildTransitionIdempotencyKey({
    actorUserId: authUserId,
    jobId,
    nextStatus,
    expectedUpdatedAt: options?.expectedUpdatedAt ?? null,
  });

  const { data, error } = await (supabase as any).rpc("technician_transition_job_v1", {
    p_job_id: jobId,
    p_source: isFleet ? "fleet_work_order" : "appointment",
    p_next_status: nextStatus,
    p_notes: notes ?? null,
    p_idempotency_key: idempotencyKey,
    p_expected_updated_at: options?.expectedUpdatedAt ?? null,
  });

  if (error) return { error: mapTransitionError(error.message ?? "Status change failed.") };
  return { error: null, replayed: Boolean(data?.replayed) };
}

interface UploadTechJobPhotoParams {
  appointmentId: string;
  businessUserId: string;
  photoType: string;
  isRequired?: boolean;
  file: File;
}

interface UploadTechJobPhotoResult {
  data: Record<string, unknown> | null;
  error: unknown | null;
}

export async function uploadTechJobPhoto({
  appointmentId,
  businessUserId,
  photoType,
  isRequired = false,
  file,
}: UploadTechJobPhotoParams): Promise<UploadTechJobPhotoResult> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { data: null, error: new Error("Not authenticated") };
  }

  const technicianId = await fetchTechnicianIdByAuthUserId(authUserId);

  const fileExt = file.name.split(".").pop();
  const fileName = `${appointmentId}/${photoType}-${Date.now()}.${fileExt}`;
  const storagePath = `${businessUserId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("job-photos")
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    return { data: null, error: uploadError };
  }

  const { data, error } = await supabase
    .from("job_photos")
    .insert({
      appointment_id: appointmentId,
      user_id: businessUserId,
      technician_id: technicianId,
      photo_type: photoType,
      storage_path: storagePath,
      file_name: file.name,
      file_size: file.size,
      is_required: isRequired,
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Emails the customer a shop-branded "technician on the way" update with the live
 * Mapbox traffic ETA. Recipient + branding are resolved server-side; the edge
 * function dedupes repeat taps inside a 90s window.
 */
export async function sendTechnicianEtaEmail(params: {
  appointmentId: string;
  etaMinutes?: number | null;
  etaLabel?: string | null;
  distanceMiles?: number | null;
  notes?: string | null;
}): Promise<{ deduped: boolean }> {
  const { data, error } = await supabase.functions.invoke("send-technician-eta", {
    body: {
      appointmentId: params.appointmentId,
      etaMinutes: params.etaMinutes ?? null,
      etaLabel: params.etaLabel ?? null,
      distanceMiles: params.distanceMiles ?? null,
      notes: params.notes ?? null,
    },
  });

  if (error) {
    let details = error.message;
    const context = (error as { context?: { text?: () => Promise<string> } }).context;
    if (context?.text) {
      try {
        const raw = await context.text();
        const parsed = JSON.parse(raw) as { error?: string };
        if (parsed?.error) details = parsed.error;
      } catch {
        /* keep original message */
      }
    }
    throw new Error(details);
  }

  if (data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }

  return { deduped: Boolean((data as { deduped?: boolean } | null)?.deduped) };
}

// Customer-facing messages are NOT sent from the device. They go through
// send_job_thread_message_v2 (see job-thread.command.ts), which authorizes the
// sender, honors opt-outs, and queues delivery for the dispatcher worker.


export async function saveTechJobNotes(jobId: string, notes: string, isFleet: boolean = false) {
  if (isFleet) {
    return supabase.rpc("save_technician_fleet_job_notes_v1" as never, { p_job_id: jobId, p_notes: notes } as never);
  }

  return supabase
    .from("appointments")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

interface SaveTechRecommendationParams {
  userId: string;
  customerId: string | null;
  vehicleId: string | null;
  appointmentId: string;
  recommendedService: string;
  estimatedCost: number | null;
  urgency: string;
  notes: string | null;
}

export async function saveTechRecommendation(params: SaveTechRecommendationParams) {
  return supabase.from("declined_services").insert({
    user_id: params.userId,
    customer_id: params.customerId,
    vehicle_id: params.vehicleId,
    appointment_id: params.appointmentId,
    recommended_service: params.recommendedService,
    estimated_cost: params.estimatedCost,
    urgency: params.urgency,
    decline_notes: params.notes,
    declined_at: new Date().toISOString(),
    follow_up_status: "pending",
  });
}

const STEP_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "You are signed out. Sign in and try again.",
  not_authorized_for_job: "This job is not assigned to you.",
  step_not_found: "That execution step no longer exists.",
  step_requires_photo: "This step requires a photo before it can be completed.",
  invalid_step_status: "Unsupported step status.",
};

/**
 * Phase 2 — advances a single persisted execution step. Photo requirements are
 * enforced server-side, so the UI cannot mark evidence-backed steps complete.
 */
export async function advanceJobExecutionStep(params: {
  stepId: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  evidenceUrl?: string | null;
  notes?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await (supabase as any).rpc("advance_job_execution_step_v1", {
    p_step_id: params.stepId,
    p_status: params.status,
    p_evidence_url: params.evidenceUrl ?? null,
    p_notes: params.notes ?? null,
  });

  if (!error) return { error: null };
  const raw = error.message ?? "Step could not be updated.";
  const code = Object.keys(STEP_ERROR_MESSAGES).find((key) => raw.includes(key));
  return { error: code ? STEP_ERROR_MESSAGES[code] : raw };
}
