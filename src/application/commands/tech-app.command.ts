import { apiClient } from "@/lib/api-client";
import { resetCurrentAuthUserCache } from "@/lib/auth/current-user";
import { getCurrentAuthUserId } from "@/application/queries/tech-app.query";
import { buildTransitionIdempotencyKey } from "@/lib/offline-transition-policy";
import { sendJobThreadHumanMessage } from "@/application/commands/job-thread.command";
import { normalizeTechNotificationPreferences, type TechnicianNotificationPreferences } from "@/lib/technician-notification-preferences";

export async function clockInCurrentTechnician() {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-app/clock-in", {});
  return { data: response.data, error: null };
}

export async function clockOutCurrentTechnician() {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-app/clock-out", {});
  return { data: response.data, error: null };
}

/**
 * Local-scope sign-out: no sanctioned server endpoint revokes the session, so
 * this mirrors `supabase.auth.signOut({ scope: "local" })` — the cached user
 * is reset and the stored session tokens are removed.
 */
export async function signOutCurrentUser() {
  resetCurrentAuthUserCache();
  if (typeof window !== "undefined") {
    for (const key of Object.keys(window.localStorage)) {
      if (/^sb-.*-auth-token(-code-verifier)?$/.test(key)) {
        window.localStorage.removeItem(key);
      }
    }
  }
  return { error: null };
}

export async function saveTechNotificationPreferences(preferences: Partial<TechnicianNotificationPreferences> | boolean) {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) return { error: "Not authenticated" };

  const normalized = typeof preferences === "boolean"
    ? normalizeTechNotificationPreferences({ pushNotificationsEnabled: preferences })
    : normalizeTechNotificationPreferences(preferences);

  try {
    await apiClient.post("/v1/tech-app/notification-settings", {
      push_notifications_enabled: normalized.pushNotificationsEnabled,
      dispatch_push_enabled: normalized.dispatchPushEnabled,
      customer_sms_enabled: normalized.customerSmsEnabled,
      customer_email_enabled: normalized.customerEmailEnabled,
      offline_cache_enabled: normalized.offlineCacheEnabled,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to save preferences" };
  }

  return { error: null };
}

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
  try {
    const response = await apiClient.post<{ data: { quantity?: number } | null }>(
      "/v1/tech-app/van-inventory-movements",
      {
        van_inventory_id: params.vanInventoryId,
        entry_type: params.entryType,
        quantity: params.quantity,
        idempotency_key: idempotencyKey,
        job_id: params.jobId ?? null,
        job_source: params.jobSource ?? null,
        note: params.note ?? null,
      },
    );
    return {
      quantity: (response.data?.quantity as number | undefined) ?? null,
      idempotencyKey,
      error: null,
    };
  } catch (error) {
    return {
      quantity: null,
      idempotencyKey,
      error: error instanceof Error ? error.message : "Failed to record movement",
    };
  }
}

export async function requestVanRestock(params: {
  vanId: string;
  items: Array<{ van_inventory_id: string; name: string; quantity: number }>;
  note?: string | null;
}) {
  try {
    const response = await apiClient.post<{ data: string | null }>("/v1/tech-app/van-restock-requests", {
      van_id: params.vanId,
      items: params.items,
      note: params.note ?? null,
    });
    return { requestId: response.data ?? null, error: null };
  } catch (error) {
    return { requestId: null, error: error instanceof Error ? error.message : "Failed to request restock" };
  }
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

  try {
    const response = await apiClient.post<{ data: { replayed?: boolean } | null }>("/v1/tech-app/job-transition", {
      job_id: jobId,
      source: isFleet ? "fleet_work_order" : "appointment",
      next_status: nextStatus,
      notes: notes ?? null,
      idempotency_key: idempotencyKey,
      expected_updated_at: options?.expectedUpdatedAt ?? null,
    });
    return { error: null, replayed: Boolean(response.data?.replayed) };
  } catch (error) {
    return { error: mapTransitionError(error instanceof Error ? error.message : "Status change failed.") };
  }
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

  const form = new FormData();
  form.append("file", file);
  form.append("appointment_id", appointmentId);
  form.append("business_user_id", businessUserId);
  form.append("photo_type", photoType);
  form.append("is_required", isRequired ? "true" : "false");

  try {
    const response = await apiClient.post<{ data: Record<string, unknown> }>("/v1/tech-app/job-photos", form);
    return { data: response.data ?? null, error: null };
  } catch (error) {
    return { data: null, error };
  }
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
  const response = await apiClient.post<{ data: { deduped: boolean } }>("/v1/tech-app/send-eta", {
    appointment_id: params.appointmentId,
    eta_minutes: params.etaMinutes ?? null,
    eta_label: params.etaLabel ?? null,
    distance_miles: params.distanceMiles ?? null,
    notes: params.notes ?? null,
  });

  return { deduped: Boolean(response.data?.deduped) };
}

// Customer-facing messages are NOT sent from the device. They go through
// send_job_thread_message_v2 (see job-thread.command.ts), which authorizes the
// sender, honors opt-outs, and queues delivery for the dispatcher worker.


export async function saveTechJobNotes(jobId: string, notes: string, isFleet: boolean = false) {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-app/job-notes", {
    job_id: jobId,
    notes,
    is_fleet: isFleet,
  });
  return { data: response.data, error: null };
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
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-app/recommendations", {
    user_id: params.userId,
    customer_id: params.customerId,
    vehicle_id: params.vehicleId,
    appointment_id: params.appointmentId,
    recommended_service: params.recommendedService,
    estimated_cost: params.estimatedCost,
    urgency: params.urgency,
    notes: params.notes,
  });
  return { data: response.data, error: null };
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
  try {
    await apiClient.post("/v1/tech-app/execution-steps/advance", {
      step_id: params.stepId,
      status: params.status,
      evidence_url: params.evidenceUrl ?? null,
      notes: params.notes ?? null,
    });
    return { error: null };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Step could not be updated.";
    const code = Object.keys(STEP_ERROR_MESSAGES).find((key) => raw.includes(key));
    return { error: code ? STEP_ERROR_MESSAGES[code] : raw };
  }
}
