import type { TeamOsTechnicianSnapshot } from "@/application/queries/technician-os.query";

export interface Technician {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  employment_type: string | null;
  hire_date: string | null;
  payroll_type: string | null;
  base_hourly_rate: number | null;
  commission_percentage: number | null;
  overtime_rate: number | null;
  max_daily_capacity_hours: number | null;
  performance_score: number | null;
  revenue_generated_mtd: number | null;
  jobs_completed_mtd: number | null;
  avg_job_duration_minutes: number | null;
  upsell_rate: number | null;
  customer_rating_avg: number | null;
  callback_rate: number | null;
  redo_rate: number | null;
  background_check_status: string | null;
  insurance_verified: boolean | null;
  license_expiration_date: string | null;
  is_active: boolean | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  team_os_snapshot?: TeamOsTechnicianSnapshot;
}

export interface TechSkill {
  id: string;
  technician_id: string;
  skill_type: string;
  certification_level: string | null;
  years_experience: number | null;
  certified_by: string | null;
  expiration_date: string | null;
  is_active: boolean | null;
}

export interface PayrollCycle {
  id: string;
  technician_id: string;
  cycle_start: string;
  cycle_end: string;
  total_hours: number;
  total_jobs: number;
  gross_revenue_generated: number;
  base_pay: number;
  commission_earned: number;
  overtime_pay: number;
  bonuses: number;
  deductions: number;
  final_payout: number;
  payout_status: string;
}

export interface Incident {
  id: string;
  technician_id: string;
  incident_date: string;
  incident_type: string;
  description: string;
  damage_amount: number | null;
  resolution_status: string;
}

export interface OnboardingTask {
  id: string;
  task_name: string;
  category: string;
  is_completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  notes: string | null;
}

export interface LeaveRequest {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
}

export interface Appraisal {
  id: string;
  review_date: string;
  overall_rating: number;
  strengths: string | null;
  areas_for_improvement: string | null;
}

export interface TechDoc {
  id: string;
  document_type: string;
  document_name: string;
  file_url: string;
  expiry_date: string | null;
  status: string;
}
