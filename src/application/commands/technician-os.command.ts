/**
 * Technician OS Commands — All write operations for the TechnicianOS page.
 * Extracted from technician-os.query.ts to enforce command/query separation.
 *
 * All writes go through the typed API client to the work-orders Hono router.
 * Exported signatures are unchanged.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
type TechnicianInsert = Tables["technicians"]["Insert"];
type TechnicianUpdate = Tables["technicians"]["Update"];

/** Update technician profile fields. */
export async function updateTechnician(techId: string, payload: Record<string, unknown>) {
  const response = await apiClient.patch<{ data: unknown }>(
    `/v1/tech-os/technicians/${encodeURIComponent(techId)}`,
    payload,
  );
  return { data: response.data, error: null };
}

/** Clear van assignment for a technician and optionally assign a new one. */
export async function updateVanAssignment(techId: string, newVanId: string | null) {
  await apiClient.post("/v1/tech-os/van-assignments", {
    tech_id: techId,
    new_van_id: newVanId,
  });
}

/** Update technician status. */
export async function updateTechnicianStatus(techId: string, status: string) {
  const response = await apiClient.patch<{ data: unknown }>(
    `/v1/tech-os/technicians/${encodeURIComponent(techId)}/status`,
    { status } satisfies TechnicianUpdate,
  );
  return { data: response.data, error: null };
}

/** Mark a payroll cycle as paid. */
export async function markPayrollPaid(cycleId: string) {
  const response = await apiClient.patch<{ data: unknown }>(
    `/v1/tech-os/payroll-cycles/${encodeURIComponent(cycleId)}/pay`,
    {},
  );
  return { data: response.data, error: null };
}

/** Recalculate performance score via RPC. */
export async function recalcPerformanceScore(techId: string) {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-os/performance-scores/recalc", {
    tech_id: techId,
  });
  return { data: response.data, error: null };
}

/** Add a new technician. */
export async function insertTechnician(userId: string, data: Record<string, unknown>) {
  try {
    const response = await apiClient.post<{ data: TechnicianInsert }>(
      "/v1/tech-os/technicians",
      { user_id: userId, profile: data },
    );
    return { data: response.data, error: null };
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "seat_limit_reached") {
      return {
        data: null,
        error: {
          code: "seat_limit_reached",
          message: "Technician seat limit reached for current plan.",
        },
      };
    }
    throw error;
  }
}

export interface CreateTeamOsTechnicianInput {
  name: string;
  email?: string;
  phone?: string;
  role: string;
  sendInvite: boolean;
  profile?: Record<string, unknown>;
}

/** Atomically create the roster record and optional account invitation. */
export async function createTeamOsTechnician(input: CreateTeamOsTechnicianInput) {
  const response = await apiClient.post<{
    data: { technician_id: string; invitation_token?: string; email?: string; name: string; invitation_delivery_error: string | null };
  }>("/v1/tech-os/technicians/create-with-invite", {
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    role: input.role,
    send_invite: input.sendInvite,
    profile: input.profile ?? {},
  });
  return response.data;
}

export type TeamOsLifecycleAction = "resend_invitation" | "revoke_invitation" | "change_role" | "lock" | "unlock" | "offboard" | "reactivate";

/** Execute a permission-checked, auditable technician account lifecycle action. */
export async function manageTeamOsTechnicianAccess(techId: string, action: TeamOsLifecycleAction, options: {
  role?: string;
  reassignTo?: string | null;
  notes?: string;
} = {}) {
  const response = await apiClient.post<{ data: unknown }>(
    `/v1/tech-os/technicians/${encodeURIComponent(techId)}/access`,
    {
      action,
      role: options.role ?? null,
      reassign_to: options.reassignTo ?? null,
      notes: options.notes ?? null,
    },
  );
  return response.data;
}

/** Insert emergency contact for a technician. */
export async function insertEmergencyContact(data: Record<string, unknown>) {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-os/emergency-contacts", {
    tech_id: String(data.technician_id ?? ""),
    user_id: String(data.user_id ?? ""),
    data,
  });
  return { data: response.data, error: null };
}

/** Insert default onboarding tasks for a technician. */
export async function insertOnboardingTasks(techId: string, userId: string, tasks: { name: string; category: string }[]) {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-os/onboarding-tasks", {
    tech_id: techId,
    user_id: userId,
    tasks,
  });
  return { data: response.data, error: null };
}

/** Add a skill to a technician. */
export async function insertTechSkill(techId: string, userId: string, skill: Record<string, unknown>) {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-os/skills", {
    tech_id: techId,
    user_id: userId,
    data: skill,
  });
  return { data: response.data, error: null };
}

/** Create a payroll cycle. */
export async function insertPayrollCycle(techId: string, userId: string, data: Record<string, unknown>) {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-os/payroll-cycles", {
    tech_id: techId,
    user_id: userId,
    data,
  });
  return { data: response.data, error: null };
}

/** Log an incident. */
export async function insertIncident(techId: string, userId: string, data: Record<string, unknown>) {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-os/incidents", {
    tech_id: techId,
    user_id: userId,
    data,
  });
  return { data: response.data, error: null };
}

/** Submit a leave request. */
export async function insertLeaveRequest(techId: string, userId: string, data: Record<string, unknown>) {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-os/leave-requests", {
    tech_id: techId,
    user_id: userId,
    data,
  });
  return { data: response.data, error: null };
}

/** Submit an appraisal. */
export async function insertAppraisal(techId: string, userId: string, data: Record<string, unknown>) {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-os/appraisals", {
    tech_id: techId,
    user_id: userId,
    data,
  });
  return { data: response.data, error: null };
}

/** Toggle onboarding task completion. */
export async function toggleOnboardingTask(taskId: string, completed: boolean) {
  const response = await apiClient.patch<{ data: unknown }>(
    `/v1/tech-os/onboarding-tasks/${encodeURIComponent(taskId)}`,
    { completed },
  );
  return { data: response.data, error: null };
}

/** Upload a technician document to storage. */
export async function uploadTechDocument(userId: string, techId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  form.append("user_id", userId);
  form.append("tech_id", techId);
  const response = await apiClient.post<{ data: { public_url: string; path: string } }>(
    "/v1/tech-os/documents/upload",
    form,
  );
  return response.data.public_url;
}

/** Insert a document record for a technician. */
export async function insertTechDocument(techId: string, userId: string, data: Record<string, unknown>) {
  const response = await apiClient.post<{ data: unknown }>("/v1/tech-os/documents", {
    tech_id: techId,
    user_id: userId,
    data,
  });
  return { data: response.data, error: null };
}
