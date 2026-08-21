/**
 * Technician OS Commands — All write operations for the TechnicianOS page.
 * Extracted from technician-os.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
type TechnicianInsert = Tables["technicians"]["Insert"];
type TechnicianUpdate = Tables["technicians"]["Update"];
type VanUpdate = Tables["vans"]["Update"];
type TechnicianEmergencyContactInsert = Tables["technician_emergency_contacts"]["Insert"];
type TechnicianOnboardingTaskInsert = Tables["technician_onboarding_tasks"]["Insert"];
type TechnicianOnboardingTaskUpdate = Tables["technician_onboarding_tasks"]["Update"];
type TechnicianSkillInsert = Tables["technician_skills"]["Insert"];
type TechnicianPayrollCycleInsert = Tables["technician_payroll_cycles"]["Insert"];
type TechnicianPayrollCycleUpdate = Tables["technician_payroll_cycles"]["Update"];
type TechnicianIncidentInsert = Tables["technician_incidents"]["Insert"];
type TechnicianLeaveRequestInsert = Tables["technician_leave_requests"]["Insert"];
type TechnicianAppraisalInsert = Tables["technician_appraisals"]["Insert"];
type TechnicianDocumentInsert = Tables["technician_documents"]["Insert"];

/** Update technician profile fields. */
export async function updateTechnician(techId: string, payload: Record<string, unknown>) {
  return supabase.from("technicians").update(payload as TechnicianUpdate).eq("id", techId);
}

/** Clear van assignment for a technician and optionally assign a new one. */
export async function updateVanAssignment(techId: string, newVanId: string | null) {
  // Clear old
  await supabase.from("vans").update({ assigned_technician_id: null } satisfies VanUpdate).eq("assigned_technician_id", techId);
  // Set new
  if (newVanId) {
    await supabase.from("vans").update({ assigned_technician_id: techId } satisfies VanUpdate).eq("id", newVanId);
  }
}

/** Update technician status. */
export async function updateTechnicianStatus(techId: string, status: string) {
  return supabase.from("technicians").update({ status } satisfies TechnicianUpdate).eq("id", techId);
}

/** Mark a payroll cycle as paid. */
export async function markPayrollPaid(cycleId: string) {
  return supabase.from("technician_payroll_cycles").update({ payout_status: "paid" } satisfies TechnicianPayrollCycleUpdate).eq("id", cycleId);
}

/** Recalculate performance score via RPC. */
export async function recalcPerformanceScore(techId: string) {
  return supabase.rpc("calculate_technician_performance_score", { p_technician_id: techId });
}

/** Add a new technician. */
export async function insertTechnician(userId: string, data: Record<string, unknown>) {
  const result = await supabase.from("technicians").insert({ user_id: userId, ...data } as TechnicianInsert).select().single();

  if (result.error?.message === 'seat_limit_reached') {
    return {
      data: null,
      error: {
        ...result.error,
        code: 'seat_limit_reached',
        message: 'Technician seat limit reached for current plan.',
      },
    } as typeof result;
  }

  return result;
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
  const { data, error } = (await supabase.rpc("create_team_os_technician_v1" as never, {
    p_name: input.name,
    p_email: input.email || null,
    p_phone: input.phone || null,
    p_role: input.role,
    p_send_invite: input.sendInvite,
    p_profile: input.profile ?? {},
  } as never)) as unknown as { data: { technician_id: string; invitation_token?: string; email?: string; name: string } | null; error: Error | null };
  if (error) throw error;
  if (!data) throw new Error("Technician creation returned no result");
  if (input.sendInvite && data.invitation_token) {
    const { error: emailError } = await supabase.functions.invoke("invite-team-member", {
      body: { email: data.email, name: data.name, invitation_token: data.invitation_token },
    });
    if (emailError) return { ...data, invitation_delivery_error: emailError.message };
  }
  return { ...data, invitation_delivery_error: null };
}

export type TeamOsLifecycleAction = "resend_invitation" | "revoke_invitation" | "change_role" | "lock" | "unlock" | "offboard" | "reactivate";

/** Execute a permission-checked, auditable technician account lifecycle action. */
export async function manageTeamOsTechnicianAccess(techId: string, action: TeamOsLifecycleAction, options: {
  role?: string;
  reassignTo?: string | null;
  notes?: string;
} = {}) {
  const { data, error } = (await supabase.rpc("manage_team_os_technician_access_v1" as never, {
    p_technician_id: techId,
    p_action: action,
    p_role: options.role ?? null,
    p_reassign_to: options.reassignTo ?? null,
    p_notes: options.notes ?? null,
  } as never)) as unknown as { data: { invitation_token?: string; email?: string; name?: string } | null; error: Error | null };
  if (error) throw error;
  if (action === "resend_invitation" && data?.invitation_token) {
    const { error: emailError } = await supabase.functions.invoke("invite-team-member", {
      body: { email: data.email, name: data.name, invitation_token: data.invitation_token },
    });
    if (emailError) throw new Error(`Invitation renewed, but delivery failed: ${emailError.message}`);
  }
  return data;
}

/** Insert emergency contact for a technician. */
export async function insertEmergencyContact(data: Record<string, unknown>) {
  return supabase.from("technician_emergency_contacts").insert(data as TechnicianEmergencyContactInsert);
}

/** Insert default onboarding tasks for a technician. */
export async function insertOnboardingTasks(techId: string, userId: string, tasks: { name: string; category: string }[]) {
  return supabase.from("technician_onboarding_tasks").insert(
    tasks.map(t => ({ technician_id: techId, user_id: userId, task_name: t.name, category: t.category } satisfies TechnicianOnboardingTaskInsert))
  );
}

/** Add a skill to a technician. */
export async function insertTechSkill(techId: string, userId: string, skill: Record<string, unknown>) {
  return supabase.from("technician_skills").insert({ technician_id: techId, user_id: userId, ...skill } as TechnicianSkillInsert);
}

/** Create a payroll cycle. */
export async function insertPayrollCycle(techId: string, userId: string, data: Record<string, unknown>) {
  return supabase.from("technician_payroll_cycles").insert({ technician_id: techId, user_id: userId, ...data } as TechnicianPayrollCycleInsert);
}

/** Log an incident. */
export async function insertIncident(techId: string, userId: string, data: Record<string, unknown>) {
  return supabase.from("technician_incidents").insert({ technician_id: techId, user_id: userId, ...data } as TechnicianIncidentInsert);
}

/** Submit a leave request. */
export async function insertLeaveRequest(techId: string, userId: string, data: Record<string, unknown>) {
  return supabase.from("technician_leave_requests").insert({ technician_id: techId, user_id: userId, ...data } as TechnicianLeaveRequestInsert);
}

/** Submit an appraisal. */
export async function insertAppraisal(techId: string, userId: string, data: Record<string, unknown>) {
  return supabase.from("technician_appraisals").insert({ technician_id: techId, user_id: userId, reviewer_id: userId, ...data } as TechnicianAppraisalInsert);
}

/** Toggle onboarding task completion. */
export async function toggleOnboardingTask(taskId: string, completed: boolean) {
  return supabase.from("technician_onboarding_tasks").update({
    is_completed: completed,
    completed_at: completed ? new Date().toISOString() : null,
  } satisfies TechnicianOnboardingTaskUpdate).eq("id", taskId);
}

/** Upload a technician document to storage. */
export async function uploadTechDocument(userId: string, techId: string, file: File) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${techId}/${Date.now()}.${fileExt}`;
  const { error } = await supabase.storage.from('technician-hr').upload(fileName, file);
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('technician-hr').getPublicUrl(fileName);
  return publicUrl;
}

/** Insert a document record for a technician. */
export async function insertTechDocument(techId: string, userId: string, data: Record<string, unknown>) {
  return supabase.from("technician_documents").insert({ technician_id: techId, user_id: userId, ...data } as TechnicianDocumentInsert);
}
