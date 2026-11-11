/**
 * Auto-dispatch v1 — server-side, creation-time only.
 *
 * Rule (Ty's ruling, 2026-11-10): when a NEW appointment is created in a
 * workspace whose auto-dispatch flag is ON, and the workspace has EXACTLY
 * ONE eligible technician, the appointment is assigned to that technician
 * immediately. Zero or 2+ eligible technicians → nobody is assigned; the
 * job waits for manual dispatch. Existing appointments are never swept —
 * this runs only at the creation boundary (staff create via
 * `bookAppointmentCore`, and the public-booking route).
 *
 * Flag: `business_profiles.auto_dispatch_enabled` is the single source of
 * truth (the store the Dispatch Settings UI writes). No row / null / false
 * = OFF. The former client stub read a second store
 * (`workspace_settings.operational_settings`); that read is retired so the
 * two stores can never disagree again (NEED-AD2).
 *
 * Eligibility mirrors `assign_dispatch_job_v1`: an active `workspace_members`
 * row with role technician / owner / manager.
 *
 * The write mirrors the RPC's appointment branch exactly:
 * `appointments.assigned_user_id` + `metadata.dispatch_status` /
 * `metadata.assigned_at`, plus one `dispatch_events` row
 * (event_type "assigned", previous_status = new_status = the appointment's
 * status). Appointment-source jobs never write `work_order_assignments`.
 * The RPC itself cannot be called from every creation boundary: it is
 * SECURITY INVOKER, requires `auth.uid()` to be an assign-capable member,
 * and is granted to `authenticated` only — the public-booking boundary is
 * anonymous and the Shop Agent path runs on an admin client, so neither
 * can invoke it. This helper therefore performs the identical write with
 * the service-role client. The eligibility check above is the same check
 * the RPC performs, and the appointment update is guarded on
 * `assigned_user_id IS NULL` so a duplicate invocation is a no-op.
 *
 * Notifications (rule v2, Ty's ruling, 2026-11-10 — supersedes the silent
 * default and the v1 notify-both rule): on the automatic path the customer
 * is NEVER emailed about the assignment; the technician receives the same
 * "job assigned" lifecycle notice the manual dispatch path sends —
 * EXCEPT when the assignee is the workspace owner (the solo
 * owner-operator is the office and the tech, so there is nobody to
 * notify). The notice goes through the canonical
 * `dispatchAppointmentLifecycle` seam with the jobAssigned event key —
 * the same single call the manual POST /v1/dispatch/assign handler makes
 * for its technician leg. The handler's customer leg
 * (technicianAssigned) is deliberately never invoked here. The manual
 * path itself is unchanged.
 *
 * Fail-soft: `attemptAutoDispatchNewAppointment` never throws. A failure
 * is logged and reported to Sentry, and the booking/create that triggered
 * it proceeds exactly as if auto-dispatch did not exist. A notification
 * failure likewise never fails the assignment or the booking.
 */
import { createSupabaseAdminClient } from "@/lib/supabase";
import { captureServerError } from "@/server/sentry";
import {
  dispatchAppointmentLifecycle,
  type AppointmentLifecycleRecord,
} from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { technicianJobUrl } from "@/server/messaging/lifecycle-action-urls";

/** The technician-eligibility role set `assign_dispatch_job_v1` enforces. */
const ELIGIBLE_TECHNICIAN_ROLES = ["technician", "owner", "manager"];

/** Same projection the manual dispatch-assign handler loads for lifecycle sends. */
const APPOINTMENT_LIFECYCLE_SELECT =
  "id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,assigned_user_id,customers(id,first_name,last_name,email),vehicles(id,year,make,model)";

export interface AutoDispatchOutcome {
  /** The workspace flag was on for this creation. */
  enabled: boolean;
  /** The appointment ended up assigned by this call. */
  assigned: boolean;
  technicianId: string | null;
  technicianName: string | null;
  /** Why nothing was assigned, when `assigned` is false. */
  reason:
    | "flag_off"
    | "no_eligible_technician"
    | "multiple_eligible_technicians"
    | "already_assigned"
    | "assignment_raced"
    | "appointment_not_found"
    | null;
}

export interface AutoDispatchInput {
  workspaceId: string;
  appointmentId: string;
  /** Audit attribution for the dispatch event (the creating staff user, or null for public/agent creates). */
  performedBy?: string | null;
  /** Request URL of the creating request, used to build lifecycle action URLs like the manual handler does. */
  requestUrl?: string | null;
}

interface EligibleTechnician {
  userId: string;
  role: string;
}

function notAssigned(enabled: boolean, reason: AutoDispatchOutcome["reason"]): AutoDispatchOutcome {
  return { enabled, assigned: false, technicianId: null, technicianName: null, reason };
}

/**
 * Resolve the technician's display name + email for the job-assigned
 * notice. Mirrors the manual handler's source (the auth record's
 * metadata, then the email prefix), with the workspace's own technicians
 * row as fallback. Best-effort: returns nulls instead of throwing.
 */
async function resolveTechnicianContact(
  db: any,
  workspaceId: string,
  technicianId: string,
): Promise<{ name: string | null; email: string | null }> {
  let name: string | null = null;
  let email: string | null = null;
  try {
    const getUserById = db?.auth?.admin?.getUserById;
    if (typeof getUserById === "function") {
      const { data } = await getUserById.call(db.auth.admin, technicianId);
      const authUser = data?.user ?? null;
      if (authUser) {
        email = typeof authUser.email === "string" ? authUser.email : null;
        const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
        name =
          (typeof metadata.full_name === "string" && metadata.full_name) ||
          (typeof metadata.name === "string" && metadata.name) ||
          (email ? email.split("@")[0] : null) ||
          null;
      }
    }
  } catch {
    // Fall through to the technicians-row lookup; contact resolution is best-effort.
  }
  if (!name || !email) {
    try {
      const { data } = await db
        .from("technicians")
        .select("name,full_name,display_name,email")
        .eq("workspace_id", workspaceId)
        .eq("auth_user_id", technicianId)
        .maybeSingle();
      if (data) {
        name = name || data.name || data.full_name || data.display_name || null;
        email = email || (typeof data.email === "string" ? data.email : null);
      }
    } catch {
      // Best-effort only; a null name/email degrades the notice, never the assignment.
    }
  }
  return { name, email };
}

/**
 * Rule v2 technician notice: the jobAssigned half of the manual handler's
 * notification block, rebuilt as the minimal canonical call — same seam
 * (`dispatchAppointmentLifecycle`), same event key, same eventId shape,
 * same action-URL builder. The customer leg is not invoked on this path.
 * Never throws; failures are observed and swallowed.
 */
async function sendTechnicianAssignedNotice(
  db: any,
  input: {
    workspaceId: string;
    appointment: AppointmentLifecycleRecord;
    technician: EligibleTechnician;
    technicianName: string | null;
    technicianEmail: string | null;
    requestUrl?: string | null;
  },
): Promise<void> {
  try {
    if (!input.technicianEmail) {
      // The manual handler skips the technician email leg the same way
      // when the technician has no email on record.
      console.warn("[AutoDispatch] technician has no email on record; job-assigned notice skipped", {
        workspaceId: input.workspaceId,
        appointmentId: input.appointment.id,
      });
      return;
    }
    if (!input.requestUrl) {
      console.warn("[AutoDispatch] no request URL available; job-assigned notice skipped", {
        workspaceId: input.workspaceId,
        appointmentId: input.appointment.id,
      });
      return;
    }
    const { data: workspace } = await db
      .from("workspaces")
      .select("name,timezone")
      .eq("id", input.workspaceId)
      .single();
    await dispatchAppointmentLifecycle({
      eventKey: LIFECYCLE_EVENT_KEYS.jobAssigned,
      eventId: `${input.appointment.id}:technician-assignment:${input.technician.userId}`,
      appointment: input.appointment,
      workspaceName: workspace?.name ?? "Service Writer",
      workspaceTimezone: workspace?.timezone ?? "UTC",
      actionUrl: technicianJobUrl(input.appointment.id, input.requestUrl),
      recipientEmail: input.technicianEmail,
      recipientRole: "technician",
      technicianName: input.technicianName ?? "Your technician",
    });
  } catch (error) {
    console.error("[AutoDispatch] technician job-assigned notice failed; assignment kept", error);
    captureServerError(error, {
      code: "auto_dispatch_notification_failed",
      workspaceId: input.workspaceId,
    });
  }
}

/**
 * The auto-dispatch decision + write for one freshly created appointment.
 * Throws on database errors — callers that must not fail the booking use
 * `attemptAutoDispatchNewAppointment` instead.
 */
export async function autoDispatchNewAppointment(
  db: any,
  input: AutoDispatchInput,
): Promise<AutoDispatchOutcome> {
  const { workspaceId, appointmentId } = input;

  const { data: profile, error: profileError } = await db
    .from("business_profiles")
    .select("auto_dispatch_enabled")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.auto_dispatch_enabled !== true) return notAssigned(false, "flag_off");

  const { data: memberRows, error: membersError } = await db
    .from("workspace_members")
    .select("user_id,role")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .in("role", ELIGIBLE_TECHNICIAN_ROLES);
  if (membersError) throw membersError;
  const eligibleByUser = new Map<string, EligibleTechnician>();
  for (const row of (memberRows ?? []) as Array<{ user_id: string; role: string }>) {
    if (!eligibleByUser.has(row.user_id)) {
      eligibleByUser.set(row.user_id, { userId: row.user_id, role: String(row.role) });
    }
  }
  const eligible = [...eligibleByUser.values()];
  if (eligible.length === 0) return notAssigned(true, "no_eligible_technician");
  if (eligible.length > 1) return notAssigned(true, "multiple_eligible_technicians");
  const technician = eligible[0];

  const { data: appointment, error: appointmentError } = await db
    .from("appointments")
    .select(APPOINTMENT_LIFECYCLE_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("id", appointmentId)
    .maybeSingle();
  if (appointmentError) throw appointmentError;
  if (!appointment) return notAssigned(true, "appointment_not_found");
  if (appointment.assigned_user_id) return notAssigned(true, "already_assigned");

  const assignedAt = new Date().toISOString();
  const metadata = {
    ...((appointment.metadata ?? {}) as Record<string, unknown>),
    dispatch_status: "assigned",
    assigned_at: assignedAt,
  };

  const { data: updatedRows, error: updateError } = await db
    .from("appointments")
    .update({ assigned_user_id: technician.userId, metadata })
    .eq("workspace_id", workspaceId)
    .eq("id", appointmentId)
    .is("assigned_user_id", null)
    .select("id");
  if (updateError) throw updateError;
  if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
    // A manual assignment landed first; the guard made this call a no-op.
    return notAssigned(true, "assignment_raced");
  }

  const { error: eventError } = await db.from("dispatch_events").insert({
    workspace_id: workspaceId,
    appointment_id: appointmentId,
    technician_id: technician.userId,
    event_type: "assigned",
    previous_status: appointment.status ?? null,
    new_status: appointment.status ?? null,
    notes: null,
    performed_by: input.performedBy ?? null,
  });
  if (eventError) throw eventError;

  const contact = await resolveTechnicianContact(db, workspaceId, technician.userId);

  // Rule v2: the owner-assignee (solo owner-operator) is never notified;
  // any other assignee gets the job-assigned notice. The customer is
  // never emailed on the automatic path.
  if (technician.role !== "owner") {
    await sendTechnicianAssignedNotice(db, {
      workspaceId,
      appointment: { ...appointment, metadata },
      technician,
      technicianName: contact.name,
      technicianEmail: contact.email,
      requestUrl: input.requestUrl ?? null,
    });
  }

  return {
    enabled: true,
    assigned: true,
    technicianId: technician.userId,
    technicianName: contact.name,
    reason: null,
  };
}

/**
 * Fail-soft entry point used at the creation boundaries. Builds the
 * service-role client (or takes an injected one), runs the decision, and
 * converts any failure into `null` + a Sentry report so a booking or
 * create is never failed by auto-dispatch.
 */
export async function attemptAutoDispatchNewAppointment(
  input: AutoDispatchInput,
  db?: any,
): Promise<AutoDispatchOutcome | null> {
  try {
    // The admin client is constructed inside the try on purpose: building it
    // can itself throw (missing env), and this wrapper's contract is that it
    // never throws — a dispatch failure must never fail the booking.
    const client = db ?? createSupabaseAdminClient();
    return await autoDispatchNewAppointment(client, input);
  } catch (error) {
    console.error("[AutoDispatch] auto-dispatch failed; the booking is unaffected", error);
    captureServerError(error, {
      code: "auto_dispatch_failed",
      workspaceId: input.workspaceId,
    });
    return null;
  }
}
