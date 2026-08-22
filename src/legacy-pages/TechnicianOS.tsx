/** Team OS manager workspace for roster, operations, development, compensation, and access. */

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  getCurrentUser as apiGetCurrentUser,
  fetchTechnicians as apiFetchTechnicians,
  fetchVans as apiFetchVans,
  fetchAssignedVan as apiFetchAssignedVan,
  fetchTechDetails as apiFetchTechDetails,
  fetchTechnicianById as apiFetchTechnicianById,
  fetchTeamOsTechnicianSnapshot as apiFetchTeamOsTechnicianSnapshot,
} from "@/application/queries/technician-os.query";
import {
  updateTechnician as apiUpdateTechnician,
  updateVanAssignment as apiUpdateVanAssignment,
  updateTechnicianStatus as apiUpdateTechnicianStatus,
  markPayrollPaid as apiMarkPayrollPaid,
  createTeamOsTechnician as apiCreateTeamOsTechnician,
  manageTeamOsTechnicianAccess as apiManageTeamOsTechnicianAccess,
  insertEmergencyContact as apiInsertEmergencyContact,
  insertOnboardingTasks as apiInsertOnboardingTasks,
  insertTechSkill as apiInsertTechSkill,
  insertPayrollCycle as apiInsertPayrollCycle,
  insertIncident as apiInsertIncident,
  insertLeaveRequest as apiInsertLeaveRequest,
  insertAppraisal as apiInsertAppraisal,
  toggleOnboardingTask as apiToggleOnboardingTask,
  uploadTechDocument as apiUploadTechDocument,
  insertTechDocument as apiInsertTechDocument,
} from "@/application/commands/technician-os.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, Star, TrendingUp, DollarSign, AlertTriangle, Shield, Search,
  Award, Clock, Zap, BarChart3, Plus, ChevronRight, Wrench,
  Calendar, CheckCircle, CheckCircle2, XCircle, Activity, Target, FileText,
  Briefcase, RefreshCw, Eye, AlertCircle, Pencil, Save, X, Truck, Link2
} from "lucide-react";
import { toast } from "sonner";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { bankersRound, formatMoney } from '@/lib/financialMath';
import { WeeklyAvailabilityGrid } from "@/components/fleet/WeeklyAvailabilityGrid";
import { useTechnicianQueue } from "@/hooks/useTechnicianQueue";
import {
  Appraisal,
  Incident,
  LeaveRequest,
  OnboardingTask,
  PayrollCycle,
  TechDoc,
  Technician,
  TechSkill,
} from "@/components/technician-os/types";
import { getStatusBadge, SKILL_TYPES } from "@/components/technician-os/ui-helpers";
import { TeamOsModuleNav } from "@/components/technician-os/TeamOsModuleNav";
import { getTeamOsModule, type TeamOsModule } from "@/application/navigation/team-os-routes";

const NO_VAN_ASSIGNMENT_VALUE = "__none__";

export default function TechnicianOS() {
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTech, setSelectedTech] = useState<Technician | null>(null);
  const [skills, setSkills] = useState<TechSkill[]>([]);
  const [payrollCycles, setPayrollCycles] = useState<PayrollCycle[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddTechDialog, setShowAddTechDialog] = useState(false);
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showAppraisalDialog, setShowAppraisalDialog] = useState(false);
  const [showDocDialog, setShowDocDialog] = useState(false);
  const [onboardingTasks, setOnboardingTasks] = useState<OnboardingTask[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [appraisals, setAppraisals] = useState<Appraisal[]>([]);
  const [docs, setDocs] = useState<TechDoc[]>([]);
  const [addingTech, setAddingTech] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleRole, setLifecycleRole] = useState("technician");
  const [reassignTechId, setReassignTechId] = useState("");

  // ── Inline edit state ──
  const [editMode, setEditMode] = useState<"identity" | "compensation" | "compliance" | null>(null);
  const [editFields, setEditFields] = useState<Partial<Technician & { assigned_van_id: string }>>({});
  const [vans, setVans] = useState<{ id: string; name: string }[]>([]);
  const [assignedVanId, setAssignedVanId] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const {
    showSkillDialog,
    setShowSkillDialog,
    showPayrollDialog,
    setShowPayrollDialog,
    showIncidentDialog,
    setShowIncidentDialog,
    markingPaid,
    setMarkingPaid,
    newSkill,
    setNewSkill,
    resetNewSkill,
    newPayroll,
    setNewPayroll,
    resetNewPayroll,
    newIncident,
    setNewIncident,
    resetNewIncident,
  } = useTechnicianQueue();

  const [addTechForm, setAddTechForm] = useState({
    name: "", email: "", phone: "", address: "",
    employment_type: "W2", hourly_rate: "", commission_percentage: "",
    overtime_rate: "", max_daily_capacity_hours: "", hire_date: "",
    drivers_license_number: "", drivers_license_expiry: "",
    emergency_contact_name: "", emergency_contact_phone: "",
    emergency_contact_relationship: "", send_invite: true, role: "technician",
  });
  const [newLeave, setNewLeave] = useState({ leave_type: "pto", start_date: "", end_date: "", reason: "" });
  const [newAppraisal, setNewAppraisal] = useState({ review_date: format(new Date(), "yyyy-MM-dd"), overall_rating: 3, strengths: "", areas_for_improvement: "" });
  const [newDoc, setNewDoc] = useState({ document_type: "other", document_name: "", file_url: "", expiry_date: "" });
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const fetchTechnicians = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const user = await apiGetCurrentUser();
      if (!user) { navigate("/login"); return; }
      const { data, error } = await apiFetchTechnicians(user.id);
      if (error) throw error;
      if (data) {
        const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
        const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
        const snapshots = await apiFetchTeamOsTechnicianSnapshot(monthStart, monthEnd);
        const snapshotByTech = new Map(snapshots.map((snapshot) => [snapshot.technician_id, snapshot]));

        const enriched = (data as unknown as Technician[]).map((tech) => {
          const snapshot = snapshotByTech.get(tech.id);
          if (!snapshot) return tech;
          return {
            ...tech,
            jobs_completed_mtd: Number(snapshot.completed_jobs),
            revenue_generated_mtd: Number(snapshot.collected_revenue),
            avg_job_duration_minutes: Number(snapshot.completed_jobs) > 0
              ? Number(snapshot.productive_minutes) / Number(snapshot.completed_jobs)
              : 0,
            team_os_snapshot: snapshot,
          };
        });

        setTechnicians(enriched);
        setSelectedTech((prev) => {
          if (!prev) return prev;
          return enriched.find((t) => t.id === prev.id) ?? prev;
        });
      }
      setCurrentUserId(user.id);

      const { data: vanData } = await apiFetchVans(user.id);
      if (vanData) setVans(vanData as { id: string; name: string }[]);
    } catch (error) {
      console.error("Failed to load Team OS workspace", error);
      setLoadError(error instanceof Error ? error.message : "Team OS data could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignedVan = async (techId: string) => {
    const { data } = await apiFetchAssignedVan(techId);
    setAssignedVanId((data as any)?.id ?? "");
  };

  const startEdit = (section: "identity" | "compensation" | "compliance") => {
    if (!selectedTech) return;
    setEditFields({ ...selectedTech, assigned_van_id: assignedVanId });
    setEditMode(section);
  };

  const cancelEdit = () => { setEditMode(null); setEditFields({}); };

  const saveEdit = async () => {
    if (!selectedTech) return;
    setSavingEdit(true);
    try {
      // Build update payload from editFields (only valid tech columns)
      const { assigned_van_id, ...techPayload } = editFields as any;
      const { error } = await apiUpdateTechnician(selectedTech.id, techPayload);
      if (error) throw error;

      // Handle van assignment change: clear old van, set new one
      if (assigned_van_id !== undefined) {
        await apiUpdateVanAssignment(selectedTech.id, assigned_van_id || null);
        setAssignedVanId(assigned_van_id);
      }

      toast.success("Profile updated");
      setEditMode(null);
      setEditFields({});
      fetchTechnicians();
      // Refresh selected tech
      const { data } = await apiFetchTechnicianById(selectedTech.id);
      if (data) setSelectedTech(data as unknown as Technician);
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedTech) return;
    const { error } = await apiUpdateTechnicianStatus(selectedTech.id, newStatus);
    if (error) { toast.error("Status update failed"); return; }
    setSelectedTech({ ...selectedTech, status: newStatus });
    setTechnicians(prev => prev.map(t => t.id === selectedTech.id ? { ...t, status: newStatus } : t));
    toast.success(`Status → ${newStatus}`);
  };

  const markPayrollPaid = async (cycleId: string) => {
    setMarkingPaid(cycleId);
    const { error } = await apiMarkPayrollPaid(cycleId);
    if (error) { toast.error("Failed to mark as paid"); }
    else { toast.success("Payroll marked as paid"); fetchTechDetails(selectedTech!.id); }
    setMarkingPaid(null);
  };

  const fetchTechDetails = async (techId: string) => {
    const {
      skills: { data: skillsData },
      payroll: { data: payrollData },
      incidents: { data: incidentData },
      onboarding: { data: onboardingData },
      leave: { data: leaveData },
      appraisals: { data: appraisalData },
      docs: { data: docData },
    } = await apiFetchTechDetails(techId);
    if (skillsData) setSkills(skillsData as unknown as TechSkill[]);
    if (payrollData) setPayrollCycles(payrollData as unknown as PayrollCycle[]);
    if (incidentData) setIncidents(incidentData as unknown as Incident[]);
    if (onboardingData) setOnboardingTasks(onboardingData as unknown as OnboardingTask[]);
    if (leaveData) setLeaveRequests(leaveData as unknown as LeaveRequest[]);
    if (appraisalData) setAppraisals(appraisalData as unknown as Appraisal[]);
    if (docData) setDocs(docData as unknown as TechDoc[]);
  };

  useEffect(() => { fetchTechnicians(); }, []);
  useEffect(() => {
    const requestedTechId = searchParams.get("tech");
    if (!requestedTechId || technicians.length === 0) return;
    const requested = technicians.find((technician) => technician.id === requestedTechId);
    if (requested) setSelectedTech(requested);
  }, [searchParams, technicians]);
  const activeModule = getTeamOsModule(searchParams.get("module"));
  const rosterQuery = searchParams.get("q") ?? "";
  const attentionOnly = searchParams.get("attention") === "1";
  const rosterState = searchParams.get("state") ?? "all";

  const updateWorkspaceContext = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setSearchParams(next, { replace: true });
  };

  const selectTechnician = (technician: Technician) => {
    setSelectedTech(technician);
    updateWorkspaceContext({ tech: technician.id });
  };

  const selectModule = (module: TeamOsModule) => {
    updateWorkspaceContext({ module: module === "overview" ? null : module });
  };

  useEffect(() => {
    const moduleTabs: Partial<Record<TeamOsModule, string>> = {
      overview: "overview", roster: "overview", schedule: "dispatch", skills: "skills", compliance: "compliance",
      development: "hr", compensation: "payroll", access: "overview",
    };
    const tab = moduleTabs[activeModule];
    if (tab) setActiveTab(tab);
  }, [activeModule]);
  useEffect(() => {
    if (selectedTech) {
      fetchTechDetails(selectedTech.id);
      fetchAssignedVan(selectedTech.id);
    }
  }, [selectedTech?.id]);

  const resetAddTechForm = () => setAddTechForm({
    name: "", email: "", phone: "", address: "",
    employment_type: "W2", hourly_rate: "", commission_percentage: "",
    overtime_rate: "", max_daily_capacity_hours: "", hire_date: "",
    drivers_license_number: "", drivers_license_expiry: "",
    emergency_contact_name: "", emergency_contact_phone: "",
    emergency_contact_relationship: "", send_invite: true, role: "technician",
  });

  const handleAddTechnician = async () => {
    if (!addTechForm.name.trim()) { toast.error("Full name is required"); return; }
    setAddingTech(true);
    try {
      const user = await apiGetCurrentUser();
      if (!user) throw new Error("Not authenticated");
      if (addTechForm.send_invite && !addTechForm.email.trim()) throw new Error("Email is required when inviting app access");
      const techData = await apiCreateTeamOsTechnician({
        name: addTechForm.name.trim(), email: addTechForm.email.trim(), phone: addTechForm.phone.trim(),
        role: addTechForm.role, sendInvite: addTechForm.send_invite,
        profile: {
          address: addTechForm.address.trim() || null,
          employment_type: addTechForm.employment_type || null,
          base_hourly_rate: addTechForm.hourly_rate ? bankersRound(Number(addTechForm.hourly_rate) || 0, 2) : null,
          commission_percentage: addTechForm.commission_percentage ? Number(addTechForm.commission_percentage) || 0 : null,
          overtime_rate: addTechForm.overtime_rate ? bankersRound(Number(addTechForm.overtime_rate) || 0, 2) : null,
          max_daily_capacity_hours: addTechForm.max_daily_capacity_hours ? parseFloat(addTechForm.max_daily_capacity_hours) : null,
          hire_date: addTechForm.hire_date || null,
          drivers_license_number: addTechForm.drivers_license_number.trim() || null,
          drivers_license_expiry: addTechForm.drivers_license_expiry || null,
        },
      });

      // Add emergency contact if provided
      if (addTechForm.emergency_contact_name) {
        await apiInsertEmergencyContact({
          technician_id: techData.technician_id,
          user_id: user.id,
          contact_name: addTechForm.emergency_contact_name,
          phone: addTechForm.emergency_contact_phone,
          relationship: addTechForm.emergency_contact_relationship,
        } as any);
      }

      // Add default onboarding tasks
      const defaultTasks = [
        { name: "Safety Training Completion", category: "training" },
        { name: "Equipment & Tool Issue", category: "tools" },
        { name: "Sign Employment Contract", category: "compliance" },
        { name: "Background Check Verification", category: "compliance" },
        { name: "Email & Communication Access", category: "general" },
      ];
      await apiInsertOnboardingTasks(techData.technician_id, user.id, defaultTasks);

      if (techData.invitation_delivery_error) toast.warning(`${addTechForm.name} was added, but invitation delivery failed. Use Access → Resend invitation.`);
      else toast.success(addTechForm.send_invite ? `${addTechForm.name} added and invited` : `${addTechForm.name} added to the roster`);
      setShowAddTechDialog(false);
      resetAddTechForm();
      fetchTechnicians();
    } catch (err: any) {
      toast.error(err.message || "Failed to add technician");
    } finally {
      setAddingTech(false);
    }
  };

  const runLifecycleAction = async (action: "resend_invitation" | "revoke_invitation" | "change_role" | "lock" | "unlock" | "offboard" | "reactivate") => {
    if (!selectedTech) return;
    if (["revoke_invitation", "lock", "offboard"].includes(action)
      && !window.confirm(action === "offboard" ? "Offboard this technician and reassign open work/assets as selected? Historical records will be retained." : "Continue with this access change?")) return;
    setLifecycleBusy(true);
    try {
      await apiManageTeamOsTechnicianAccess(selectedTech.id, action, {
        role: action === "change_role" || action === "unlock" ? lifecycleRole : undefined,
        reassignTo: action === "offboard" ? reassignTechId || null : undefined,
        notes: action === "offboard" ? "Offboarded from Team OS" : undefined,
      });
      toast.success(action.replace(/_/g, " "));
      await fetchTechnicians();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account lifecycle action failed");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const addSkill = async () => {
    if (!selectedTech || !newSkill.skill_type) return;
    const user = await apiGetCurrentUser();
    const { error } = await apiInsertTechSkill(selectedTech.id, user!.id, {
      ...newSkill,
      expiration_date: newSkill.expiration_date || null,
    });
    if (error) { toast.error("Failed to add skill"); return; }
    toast.success("Skill added");
    setShowSkillDialog(false);
    resetNewSkill();
    fetchTechDetails(selectedTech.id);
  };

  const createPayrollCycle = async () => {
    if (!selectedTech || !newPayroll.cycle_start || !newPayroll.cycle_end) return;
    const user = await apiGetCurrentUser();
    const tech = selectedTech;
    // Calculate base pay & commission
    const base_pay = (tech.base_hourly_rate || 0) * newPayroll.total_hours;
    const commission_earned = (newPayroll.gross_revenue_generated * (tech.commission_percentage || 0)) / 100;
    const regular_hours = Math.min(newPayroll.total_hours, 40);
    const overtime_hours = Math.max(0, newPayroll.total_hours - 40);
    const overtime_pay = overtime_hours * (tech.overtime_rate || (tech.base_hourly_rate || 0) * 1.5);
    const final_payout = base_pay + commission_earned + overtime_pay + newPayroll.bonuses - newPayroll.deductions;

    const { error } = await apiInsertPayrollCycle(selectedTech.id, user!.id, {
      ...newPayroll,
      base_pay,
      commission_earned,
      regular_hours,
      overtime_hours,
      overtime_pay,
      final_payout,
    });
    if (error) { toast.error("Failed to create payroll cycle"); return; }
    toast.success("Payroll cycle created");
    setShowPayrollDialog(false);
    resetNewPayroll();
    fetchTechDetails(selectedTech.id);
  };

  const logIncident = async () => {
    if (!selectedTech || !newIncident.description) return;
    const user = await apiGetCurrentUser();
    const { error } = await apiInsertIncident(selectedTech.id, user!.id, {
      ...newIncident,
      damage_amount: newIncident.damage_amount || null,
    });
    if (error) { toast.error("Failed to log incident"); return; }
    toast.success("Incident logged");
    setShowIncidentDialog(false);
    resetNewIncident();
    fetchTechDetails(selectedTech.id);
  };

  const submitLeaveRequest = async () => {
    if (!selectedTech || !newLeave.start_date || !newLeave.end_date) return;
    const user = await apiGetCurrentUser();
    const { error } = await apiInsertLeaveRequest(selectedTech.id, user!.id, newLeave);
    if (error) { toast.error("Failed to submit leave request"); return; }
    toast.success("Leave request submitted");
    setShowLeaveDialog(false);
    fetchTechDetails(selectedTech.id);
  };

  const submitAppraisal = async () => {
    if (!selectedTech || !newAppraisal.review_date) return;
    const user = await apiGetCurrentUser();
    const { error } = await apiInsertAppraisal(selectedTech.id, user!.id, newAppraisal);
    if (error) { toast.error("Failed to submit appraisal"); return; }
    toast.success("Performance appraisal saved");
    setShowAppraisalDialog(false);
    fetchTechDetails(selectedTech.id);
  };

  const toggleOnboardingTask = async (taskId: string, current: boolean) => {
    const { error } = await apiToggleOnboardingTask(taskId, !current);
    if (error) { toast.error("Update failed"); return; }
    if (selectedTech) fetchTechDetails(selectedTech.id);
  };

  const handleDocUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedTech) return;

    try {
      const user = await apiGetCurrentUser();
      if (!user) throw new Error("Not authenticated");

      const publicUrl = await apiUploadTechDocument(user.id, selectedTech.id, file);

      const { error: dbError } = await apiInsertTechDocument(selectedTech.id, user.id, {
        technician_id: selectedTech.id,
        user_id: user.id,
        document_type: newDoc.document_type,
        document_name: newDoc.document_name || file.name,
        file_url: publicUrl,
        expiry_date: newDoc.expiry_date || null,
        status: 'pending_review'
      } as any);

      if (dbError) throw dbError;

      toast.success("Document uploaded successfully");
      setShowDocDialog(false);
      setNewDoc({ document_type: "other", document_name: "", file_url: "", expiry_date: "" });
      fetchTechDetails(selectedTech.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload document");
    }
  };

  // ── Fleet-level summary stats
  const totalRevenueMTD = technicians.reduce((s, t) => s + (t.revenue_generated_mtd || 0), 0);
  const activeTechnicians = technicians.filter((technician) => technician.team_os_snapshot?.employment_state !== "inactive");
  const activeTechnicianCount = activeTechnicians.length;
  const avgUtilization = activeTechnicians.length
    ? activeTechnicians.reduce((sum, technician) => sum + Number(technician.team_os_snapshot?.utilization || 0), 0) / activeTechnicians.length
    : 0;
  const needsAttention = technicians.filter(t =>
    t.team_os_snapshot
      ? Number(t.team_os_snapshot.compliance_issue_count) > 0 || Number(t.team_os_snapshot.onboarding_open_count) > 0
      : (t.license_expiration_date && new Date(t.license_expiration_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) || !t.insurance_verified
  );
  const freshnessValues = technicians
    .map((technician) => technician.team_os_snapshot?.data_fresh_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  const dataFreshAt = freshnessValues[freshnessValues.length - 1];
  const attentionIds = new Set(needsAttention.map((technician) => technician.id));
  const visibleTechnicians = (() => {
    const normalizedQuery = rosterQuery.trim().toLowerCase();
    return technicians
      .filter((technician) => !attentionOnly || attentionIds.has(technician.id))
      .filter((technician) => rosterState === "all"
        || technician.team_os_snapshot?.employment_state === rosterState
        || technician.team_os_snapshot?.access_state === rosterState)
      .filter((technician) => !normalizedQuery || [technician.name, technician.email, technician.phone, technician.team_os_snapshot?.assigned_van_name]
        .some((value) => value?.toLowerCase().includes(normalizedQuery)))
      .sort((a, b) => (b.revenue_generated_mtd || 0) - (a.revenue_generated_mtd || 0));
  })();

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout>
        <Card className="mx-auto max-w-xl">
          <CardHeader><CardTitle>Team OS could not load</CardTitle><CardDescription>{loadError}</CardDescription></CardHeader>
          <CardContent><Button onClick={fetchTechnicians}>Retry</Button></CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              Team OS
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              One roster for technician access, work, performance, capacity, compliance, and development
            </p>
            {dataFreshAt && <p className="mt-1 text-xs text-muted-foreground">Canonical month-to-date metrics · refreshed {new Date(dataFreshAt).toLocaleString()}</p>}
          </div>
          <Button onClick={() => setShowAddTechDialog(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> Add Technician
          </Button>
        </div>

        <TeamOsModuleNav active={activeModule} attentionCount={needsAttention.length} onChange={selectModule} />

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Source systems</span>
          <Button size="sm" variant="outline" onClick={() => navigate("/dispatch-engine")} className="gap-1.5"><Calendar className="h-3.5 w-3.5" /> Dispatch board</Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/payments")} className="gap-1.5"><DollarSign className="h-3.5 w-3.5" /> Payment ledger</Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/fleet")} className="gap-1.5"><Truck className="h-3.5 w-3.5" /> Vans</Button>
          <span className="ml-auto text-xs text-muted-foreground">Filters and technician selection stay in the URL</span>
        </div>

        {/* Fleet KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Techs</p>
                  <p className="text-2xl font-bold">{activeTechnicianCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100">
                  <DollarSign className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Collected MTD</p>
                  <p className="text-2xl font-bold">${totalRevenueMTD.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Star className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Utilization</p>
                  <p className="text-2xl font-bold text-blue-600">{(avgUtilization * 100).toFixed(0)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Needs Attention</p>
                  <p className="text-2xl font-bold text-red-600">{needsAttention.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Technician List (Leaderboard) */}
          <div className={`${selectedTech ? "hidden lg:block" : "block"} lg:col-span-1 space-y-3`}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Technician roster · Collected revenue MTD
              </h2>
            </div>
            <div className="space-y-2 rounded-lg border bg-card p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={rosterQuery} onChange={(event) => updateWorkspaceContext({ q: event.target.value || null })} placeholder="Search name, email, phone, or van" className="pl-9" />
              </div>
              <Select value={rosterState} onValueChange={(value) => updateWorkspaceContext({ state: value === "all" ? null : value })}>
                <SelectTrigger><SelectValue placeholder="All roster states" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roster states</SelectItem>
                  <SelectItem value="active">Active employment</SelectItem>
                  <SelectItem value="inactive">Inactive employment</SelectItem>
                  <SelectItem value="linked">Linked account</SelectItem>
                  <SelectItem value="invited">Invited account</SelectItem>
                  <SelectItem value="roster_only">Roster only</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="w-full justify-between" variant={attentionOnly ? "destructive" : "outline"} onClick={() => updateWorkspaceContext({ attention: attentionOnly ? null : "1" })}>
                Attention queue <Badge variant={attentionOnly ? "secondary" : "destructive"}>{needsAttention.length}</Badge>
              </Button>
            </div>
            {technicians.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No technicians yet.</p>
                  <Button size="sm" className="mt-3 gap-2" onClick={() => setShowAddTechDialog(true)}>
                    <Plus className="h-4 w-4" /> Add Technician
                  </Button>
                </CardContent>
              </Card>
            ) : (
              visibleTechnicians.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No technicians match these filters.</CardContent></Card>
              ) : visibleTechnicians
                .map((tech, idx) => (
                  <Card
                    key={tech.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${selectedTech?.id === tech.id ? "border-primary shadow-md" : ""}`}
                    onClick={() => selectTechnician(tech)}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-md bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                          #{idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{tech.name}</p>
                            <Badge className={`text-[10px] px-1.5 py-0 ${getStatusBadge(tech.status)}`}>
                              {tech.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground">
                              ${(tech.revenue_generated_mtd || 0).toLocaleString()} collected
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {tech.jobs_completed_mtd || 0} jobs
                            </span>
                          </div>
                          {tech.team_os_snapshot && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              <Badge variant="outline" className="text-[10px]">{tech.team_os_snapshot.access_state.replace("_", " ")}</Badge>
                              {tech.team_os_snapshot.assigned_van_name && <Badge variant="outline" className="text-[10px]">{tech.team_os_snapshot.assigned_van_name}</Badge>}
                              {Number(tech.team_os_snapshot.compliance_issue_count) > 0 && <Badge variant="destructive" className="text-[10px]">{tech.team_os_snapshot.compliance_issue_count} compliance</Badge>}
                            </div>
                          )}
                          {/* Canonical period utilization */}
                          <div className="mt-2 flex items-center gap-2">
                            <Progress
                              value={Number(tech.team_os_snapshot?.utilization || 0) * 100}
                              className="h-1.5 flex-1"
                            />
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {(Number(tech.team_os_snapshot?.utilization || 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>

                      {/* Risk Flags */}
                      {(!tech.insurance_verified || (tech.license_expiration_date && new Date(tech.license_expiration_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))) && (
                        <div className="mt-2 flex gap-1">
                          {!tech.insurance_verified && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">⚠ Insurance</Badge>
                          )}
                          {tech.license_expiration_date && new Date(tech.license_expiration_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">⚠ License Exp.</Badge>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
            )}
          </div>

          {/* Right: Detail Panel */}
          <div className={`${selectedTech ? "block" : "hidden lg:block"} lg:col-span-2`}>
            {!selectedTech ? (
              <Card className="h-full">
                <CardContent className="h-full flex items-center justify-center py-24">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">Select a technician to view their full profile</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Tech Header */}
                <Card>
                  <CardContent className="py-4">
                    <Button variant="ghost" size="sm" className="mb-3 -ml-2 lg:hidden" onClick={() => {
                      setSelectedTech(null);
                      updateWorkspaceContext({ tech: null });
                    }}>← Back to roster</Button>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold">{selectedTech.name}</h2>
                        <p className="text-sm text-muted-foreground">{selectedTech.email} · {selectedTech.phone}</p>
                        <div className="flex gap-2 mt-2 flex-wrap items-center">
                          {/* Live status selector */}
                          <Select value={selectedTech.status} onValueChange={handleStatusChange}>
                            <SelectTrigger className="h-7 w-auto text-xs px-2 border-0 bg-muted/60">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["available","offline","on_break","en_route","suspended"].map(s => (
                                <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("_"," ")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selectedTech.employment_type && (
                            <Badge variant="outline" className="uppercase text-[10px]">{selectedTech.employment_type}</Badge>
                          )}
                          {selectedTech.payroll_type && (
                            <Badge variant="outline" className="capitalize text-[10px]">{selectedTech.payroll_type?.replace("_", " ")}</Badge>
                          )}
                          <Badge className={`${selectedTech.background_check_status === "cleared" ? "bg-gray-100 text-gray-800" : "bg-yellow-100 text-yellow-800"} text-[10px]`}>
                            BGC: {selectedTech.background_check_status || "pending"}
                          </Badge>
                          {selectedTech.insurance_verified ? (
                            <Badge className="bg-gray-100 text-gray-800 text-[10px]">✓ Insured</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">⚠ Insurance Unverified</Badge>
                          )}
                          {/* Assigned Van cross-link */}
                          {assignedVanId ? (
                            <button
                              onClick={() => navigate(`/fleet/${assignedVanId}`)}
                              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-medium px-2 py-0.5 rounded border border-primary/30 bg-primary/5"
                            >
                              <Truck className="h-3 w-3" /> View Assigned Van
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">No van assigned</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {activeModule === "access" && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Technician access</CardTitle>
                      <CardDescription>Manage invitation, role, lock, reactivation and offboarding without deleting historical work or financial records.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Access state</p><p className="mt-1 font-medium capitalize">{selectedTech.team_os_snapshot?.access_state.replace("_", " ") ?? "Roster only"}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Employment</p><p className="mt-1 font-medium capitalize">{selectedTech.team_os_snapshot?.employment_state ?? "Unknown"}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Field status</p><p className="mt-1 font-medium capitalize">{selectedTech.team_os_snapshot?.field_status.replace("_", " ") ?? selectedTech.status}</p></div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2"><Label>Workspace role</Label><Select value={lifecycleRole} onValueChange={setLifecycleRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                          <SelectItem value="technician">Technician</SelectItem><SelectItem value="lead_technician">Lead technician</SelectItem><SelectItem value="dispatcher">Dispatcher</SelectItem><SelectItem value="service_advisor">Service advisor</SelectItem><SelectItem value="manager">Manager</SelectItem>
                        </SelectContent></Select></div>
                        <div className="space-y-2"><Label>Reassign open work and van on offboarding</Label><Select value={reassignTechId || "unassigned"} onValueChange={value => setReassignTechId(value === "unassigned" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                          <SelectItem value="unassigned">Leave unassigned</SelectItem>{technicians.filter(t => t.id !== selectedTech.id && t.is_active !== false).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent></Select></div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedTech.team_os_snapshot?.access_state === "invited" && <><Button size="sm" variant="outline" disabled={lifecycleBusy} onClick={() => runLifecycleAction("resend_invitation")}>Resend invitation</Button><Button size="sm" variant="outline" disabled={lifecycleBusy} onClick={() => runLifecycleAction("revoke_invitation")}>Revoke invitation</Button></>}
                        {selectedTech.team_os_snapshot?.access_state === "linked" && <Button size="sm" variant="outline" disabled={lifecycleBusy} onClick={() => runLifecycleAction("lock")}>Lock access</Button>}
                        {selectedTech.team_os_snapshot?.access_state === "locked" && <Button size="sm" variant="outline" disabled={lifecycleBusy} onClick={() => runLifecycleAction("unlock")}>Unlock access</Button>}
                        {["invited","linked","locked"].includes(selectedTech.team_os_snapshot?.access_state ?? "") && <Button size="sm" variant="outline" disabled={lifecycleBusy} onClick={() => runLifecycleAction("change_role")}>Update role</Button>}
                        {selectedTech.team_os_snapshot?.access_state !== "deactivated" ? <Button size="sm" variant="destructive" disabled={lifecycleBusy} onClick={() => runLifecycleAction("offboard")}>Offboard technician</Button> : <Button size="sm" disabled={lifecycleBusy} onClick={() => runLifecycleAction("reactivate")}>Reactivate roster</Button>}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="hidden">
                    <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                    <TabsTrigger value="skills" className="text-xs">Skills</TabsTrigger>
                    <TabsTrigger value="payroll" className="text-xs">Payroll</TabsTrigger>
                    <TabsTrigger value="hr" className="text-xs">HR Suite</TabsTrigger>
                    <TabsTrigger value="compliance" className="text-xs">Compliance</TabsTrigger>
                    <TabsTrigger value="dispatch" className="text-xs">Dispatch</TabsTrigger>
                  </TabsList>

                  {/* ── OVERVIEW TAB ── */}
                  <TabsContent value="overview" className="space-y-4 mt-4">
                    {/* Canonical period utilization */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Target className="h-4 w-4 text-primary" /> Utilization MTD
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4">
                          <div className="text-5xl font-black text-primary">
                            {(Number(selectedTech.team_os_snapshot?.utilization || 0) * 100).toFixed(0)}%
                          </div>
                          <div className="flex-1">
                            <Progress value={Number(selectedTech.team_os_snapshot?.utilization || 0) * 100} className="h-3" />
                            <p className="text-xs text-muted-foreground mt-1">
                              {Number(selectedTech.team_os_snapshot?.productive_minutes || 0).toLocaleString()} productive minutes / {Number(selectedTech.team_os_snapshot?.available_minutes || 0).toLocaleString()} available minutes
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* KPI Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { label: "Revenue MTD", value: `$${(selectedTech.revenue_generated_mtd || 0).toLocaleString()}`, icon: DollarSign, color: "text-gray-600" },
                        { label: "Jobs MTD", value: selectedTech.jobs_completed_mtd || 0, icon: CheckCircle, color: "text-blue-600" },
                        { label: "Avg Job Time", value: selectedTech.avg_job_duration_minutes ? `${selectedTech.avg_job_duration_minutes}m` : "—", icon: Clock, color: "text-purple-600" },
                        { label: "Customer Rating", value: selectedTech.customer_rating_avg ? `${selectedTech.customer_rating_avg.toFixed(1)} ★` : "—", icon: Star, color: "text-yellow-600" },
                        { label: "Upsell Rate", value: `${(selectedTech.upsell_rate || 0).toFixed(1)}%`, icon: TrendingUp, color: "text-emerald-600" },
                        { label: "Redo Rate", value: `${(selectedTech.redo_rate || 0).toFixed(1)}%`, icon: RefreshCw, color: selectedTech.redo_rate && selectedTech.redo_rate > 5 ? "text-red-600" : "text-muted-foreground" },
                      ].map(({ label, value, icon: Icon, color }) => (
                        <Card key={label} className="shadow-none border">
                          <CardContent className="py-3 px-4">
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className={`h-3.5 w-3.5 ${color}`} />
                              <p className="text-xs text-muted-foreground">{label}</p>
                            </div>
                            <p className={`text-lg font-bold ${color}`}>{value}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Identity & Compensation inline edit */}
                    <Card>
                      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Briefcase className="h-4 w-4" /> Identity & Compensation
                        </CardTitle>
                        {editMode !== "identity" && editMode !== "compensation" ? (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit("identity")}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={cancelEdit}><X className="h-3 w-3" />Cancel</Button>
                            <Button size="sm" className="h-7 text-xs gap-1" onClick={saveEdit} disabled={savingEdit}><Save className="h-3 w-3" />{savingEdit ? "Saving…" : "Save"}</Button>
                          </div>
                        )}
                      </CardHeader>
                      <CardContent>
                        {(editMode === "identity" || editMode === "compensation") ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div><Label className="text-xs">Full Name</Label><Input className="h-8 text-sm" value={editFields.name ?? ""} onChange={e => setEditFields(f => ({ ...f, name: e.target.value }))} /></div>
                              <div><Label className="text-xs">Email</Label><Input className="h-8 text-sm" value={editFields.email ?? ""} onChange={e => setEditFields(f => ({ ...f, email: e.target.value }))} /></div>
                              <div><Label className="text-xs">Phone</Label><Input className="h-8 text-sm" value={editFields.phone ?? ""} onChange={e => setEditFields(f => ({ ...f, phone: e.target.value }))} /></div>
                              <div><Label className="text-xs">Hire Date</Label><Input type="date" className="h-8 text-sm" value={editFields.hire_date ?? ""} onChange={e => setEditFields(f => ({ ...f, hire_date: e.target.value }))} /></div>
                              <div><Label className="text-xs">Employment Type</Label>
                                <Select value={editFields.employment_type ?? ""} onValueChange={v => setEditFields(f => ({ ...f, employment_type: v }))}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="W2">W2</SelectItem><SelectItem value="1099">1099</SelectItem><SelectItem value="part_time">Part-time</SelectItem></SelectContent>
                                </Select>
                              </div>
                              <div><Label className="text-xs">Payroll Type</Label>
                                <Select value={editFields.payroll_type ?? ""} onValueChange={v => setEditFields(f => ({ ...f, payroll_type: v }))}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="hourly">Hourly</SelectItem><SelectItem value="salary">Salary</SelectItem><SelectItem value="commission_only">Commission Only</SelectItem></SelectContent>
                                </Select>
                              </div>
                            </div>
                            <Separator />
                            <div className="grid grid-cols-2 gap-3">
                              <div><Label className="text-xs">Base Rate ($/hr)</Label><Input type="number" className="h-8 text-sm" value={editFields.base_hourly_rate ?? ""} onChange={e => setEditFields(f => ({ ...f, base_hourly_rate: Number(e.target.value) }))} /></div>
                              <div><Label className="text-xs">Commission %</Label><Input type="number" className="h-8 text-sm" value={editFields.commission_percentage ?? ""} onChange={e => setEditFields(f => ({ ...f, commission_percentage: Number(e.target.value) }))} /></div>
                              <div><Label className="text-xs">OT Rate ($/hr)</Label><Input type="number" className="h-8 text-sm" value={editFields.overtime_rate ?? ""} onChange={e => setEditFields(f => ({ ...f, overtime_rate: Number(e.target.value) }))} /></div>
                              <div><Label className="text-xs">Daily Cap (hrs)</Label><Input type="number" className="h-8 text-sm" value={editFields.max_daily_capacity_hours ?? ""} onChange={e => setEditFields(f => ({ ...f, max_daily_capacity_hours: Number(e.target.value) }))} /></div>
                            </div>
                            <Separator />
                            <div><Label className="text-xs">Assign Van</Label>
                              <Select
                                value={editFields.assigned_van_id || NO_VAN_ASSIGNMENT_VALUE}
                                onValueChange={(v) =>
                                  setEditFields((f) => ({
                                    ...f,
                                    assigned_van_id: v === NO_VAN_ASSIGNMENT_VALUE ? "" : v,
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="No van assigned" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NO_VAN_ASSIGNMENT_VALUE}>None</SelectItem>
                                  {vans.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Base Rate</span><span className="font-medium">{selectedTech.base_hourly_rate ? `$${selectedTech.base_hourly_rate}/hr` : "—"}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Commission</span><span className="font-medium">{selectedTech.commission_percentage ? `${selectedTech.commission_percentage}%` : "—"}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">OT Rate</span><span className="font-medium">{selectedTech.overtime_rate ? `$${selectedTech.overtime_rate}/hr` : "1.5×"}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Daily Cap</span><span className="font-medium">{selectedTech.max_daily_capacity_hours || 8}h</span></div>
                            <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Employment</span><span className="font-medium">{selectedTech.employment_type || "—"} · {selectedTech.payroll_type?.replace("_"," ") || "—"}</span></div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Weekly Availability Grid */}
                    {selectedTech && currentUserId && (
                      <WeeklyAvailabilityGrid technicianId={selectedTech.id} userId={currentUserId} />
                    )}
                  </TabsContent>

                  {/* ── SKILLS TAB ── */}
                  <TabsContent value="skills" className="space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Certification Matrix</h3>
                      <Dialog open={showSkillDialog} onOpenChange={setShowSkillDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="gap-1.5">
                            <Plus className="h-3.5 w-3.5" /> Add Skill
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add Skill / Certification</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-2">
                            <div>
                              <Label>Skill Type</Label>
                              <Select value={newSkill.skill_type} onValueChange={v => setNewSkill(s => ({ ...s, skill_type: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select skill" /></SelectTrigger>
                                <SelectContent>
                                  {SKILL_TYPES.map(s => (
                                    <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Certification Level</Label>
                              <Select value={newSkill.certification_level} onValueChange={v => setNewSkill(s => ({ ...s, certification_level: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["basic", "intermediate", "advanced", "master", "certified"].map(l => (
                                    <SelectItem key={l} value={l}>{l}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label>Years Experience</Label>
                                <Input type="number" value={newSkill.years_experience} onChange={e => setNewSkill(s => ({ ...s, years_experience: Number(e.target.value) }))} />
                              </div>
                              <div>
                                <Label>Expires</Label>
                                <Input type="date" value={newSkill.expiration_date} onChange={e => setNewSkill(s => ({ ...s, expiration_date: e.target.value }))} />
                              </div>
                            </div>
                            <div>
                              <Label>Certified By</Label>
                              <Input value={newSkill.certified_by} onChange={e => setNewSkill(s => ({ ...s, certified_by: e.target.value }))} placeholder="ASE, Manufacturer, etc." />
                            </div>
                            <Button className="w-full" onClick={addSkill}>Add Skill</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {skills.length === 0 ? (
                      <Card>
                        <CardContent className="py-10 text-center">
                          <Wrench className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No skills on file. Add certifications to enable smart dispatch.</p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {skills.map(skill => {
                          const isExpiringSoon = skill.expiration_date && new Date(skill.expiration_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                          return (
                            <Card key={skill.id} className={`shadow-none ${isExpiringSoon ? "border-yellow-400" : ""}`}>
                              <CardContent className="py-3 px-4">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="font-medium text-sm capitalize">{skill.skill_type.replace(/_/g, " ")}</p>
                                    <Badge variant="outline" className="text-[10px] mt-1 capitalize">{skill.certification_level}</Badge>
                                  </div>
                                  {isExpiringSoon && <Badge variant="destructive" className="text-[10px]">Expiring</Badge>}
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                                  {skill.years_experience && <p>{skill.years_experience} yrs exp</p>}
                                  {skill.certified_by && <p>By: {skill.certified_by}</p>}
                                  {skill.expiration_date && <p>Expires: {format(new Date(skill.expiration_date), "MMM d, yyyy")}</p>}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* ── PAYROLL TAB ── */}
                  <TabsContent value="payroll" className="space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Payroll Cycles</h3>
                      <Dialog open={showPayrollDialog} onOpenChange={setShowPayrollDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="gap-1.5">
                            <Plus className="h-3.5 w-3.5" /> New Cycle
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create Payroll Cycle</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3 pt-2">
                            <div className="grid grid-cols-2 gap-3">
                              <div><Label>Cycle Start</Label><Input type="date" value={newPayroll.cycle_start} onChange={e => setNewPayroll(p => ({ ...p, cycle_start: e.target.value }))} /></div>
                              <div><Label>Cycle End</Label><Input type="date" value={newPayroll.cycle_end} onChange={e => setNewPayroll(p => ({ ...p, cycle_end: e.target.value }))} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div><Label>Total Hours</Label><Input type="number" value={newPayroll.total_hours} onChange={e => setNewPayroll(p => ({ ...p, total_hours: Number(e.target.value) }))} /></div>
                              <div><Label>Total Jobs</Label><Input type="number" value={newPayroll.total_jobs} onChange={e => setNewPayroll(p => ({ ...p, total_jobs: Number(e.target.value) }))} /></div>
                            </div>
                            <div><Label>Gross Revenue Generated ($)</Label><Input type="number" value={newPayroll.gross_revenue_generated} onChange={e => setNewPayroll(p => ({ ...p, gross_revenue_generated: Number(e.target.value) }))} /></div>
                            <div className="grid grid-cols-2 gap-3">
                              <div><Label>Bonuses ($)</Label><Input type="number" value={newPayroll.bonuses} onChange={e => setNewPayroll(p => ({ ...p, bonuses: Number(e.target.value) }))} /></div>
                              <div><Label>Deductions ($)</Label><Input type="number" value={newPayroll.deductions} onChange={e => setNewPayroll(p => ({ ...p, deductions: Number(e.target.value) }))} /></div>
                            </div>
                            <Button className="w-full" onClick={createPayrollCycle}>Create & Calculate</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {payrollCycles.length === 0 ? (
                      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No payroll cycles yet.</CardContent></Card>
                    ) : (
                      <div className="space-y-3">
                        {payrollCycles.map(cycle => (
                          <Card key={cycle.id} className="shadow-none">
                            <CardContent className="py-3 px-4">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <p className="font-medium text-sm">
                                    {format(new Date(cycle.cycle_start), "MMM d")} – {format(new Date(cycle.cycle_end), "MMM d, yyyy")}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{cycle.total_jobs} jobs · {cycle.total_hours}h worked</p>
                                </div>
                                <Badge className={
                                  cycle.payout_status === "paid" ? "bg-gray-100 text-gray-800" :
                                  cycle.payout_status === "processing" ? "bg-blue-100 text-blue-800" :
                                  "bg-yellow-100 text-yellow-800"
                                }>{cycle.payout_status}</Badge>
                              </div>
                              <Separator className="my-2" />
                              <div className="grid grid-cols-3 gap-x-4 text-xs">
                                <div><p className="text-muted-foreground">Base Pay</p><p className="font-semibold">${formatMoney(cycle.base_pay || 0)}</p></div>
                                <div><p className="text-muted-foreground">Commission</p><p className="font-semibold">${formatMoney(cycle.commission_earned || 0)}</p></div>
                                <div><p className="text-muted-foreground">OT Pay</p><p className="font-semibold">${formatMoney(cycle.overtime_pay || 0)}</p></div>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Net Payout</span>
                                  <span className="text-base font-bold text-gray-600">${formatMoney(cycle.final_payout || 0)}</span>
                                </div>
                                {cycle.payout_status !== "paid" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1 text-gray-700 border-green-300 hover:bg-green-50"
                                    disabled={markingPaid === cycle.id}
                                    onClick={() => markPayrollPaid(cycle.id)}
                                  >
                                    <CheckCircle className="h-3 w-3" />
                                    {markingPaid === cycle.id ? "Saving…" : "Mark Paid"}
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* ── HR SUITE TAB ── */}
                  <TabsContent value="hr" className="space-y-6 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Onboarding Checklist */}
                      <Card>
                        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                          <div>
                            <CardTitle className="text-sm">Onboarding Progress</CardTitle>
                            <CardDescription className="text-xs">
                              {onboardingTasks.filter(t => t.is_completed).length} of {onboardingTasks.length} tasks completed
                            </CardDescription>
                          </div>
                          <Badge variant="outline" className="text-[10px]">Step 1: Intake</Badge>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {onboardingTasks.map(task => (
                              <div key={task.id} className="flex items-center gap-2 group cursor-pointer" onClick={() => toggleOnboardingTask(task.id, task.is_completed)}>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${task.is_completed ? "bg-primary border-primary text-white" : "border-muted-foreground group-hover:border-primary"}`}>
                                  {task.is_completed && <CheckCircle2 className="h-3 w-3" />}
                                </div>
                                <span className={`text-sm flex-1 ${task.is_completed ? "text-muted-foreground line-through" : ""}`}>{task.task_name}</span>
                                <Badge variant="secondary" className="text-[9px] px-1 py-0">{task.category}</Badge>
                              </div>
                            ))}
                            {onboardingTasks.length === 0 && (
                              <p className="text-xs text-muted-foreground text-center py-4 italic">No onboarding tasks defined.</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Time Off / Leave Requests */}
                      <Card>
                        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                          <div>
                            <CardTitle className="text-sm">Leave & Time Off</CardTitle>
                            <CardDescription className="text-xs">Manage PTO and sick leave</CardDescription>
                          </div>
                          <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><Plus className="h-4 w-4" /></Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
                              <div className="space-y-3 pt-2">
                                <div><Label>Leave Type</Label><Select value={newLeave.leave_type} onValueChange={v => setNewLeave(l => ({ ...l, leave_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pto">PTO / Vacation</SelectItem><SelectItem value="sick">Sick Leave</SelectItem><SelectItem value="jury_duty">Jury Duty</SelectItem><SelectItem value="bereavement">Bereavement</SelectItem><SelectItem value="unpaid">Unpaid</SelectItem></SelectContent></Select></div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div><Label>Start Date</Label><Input type="date" value={newLeave.start_date} onChange={e => setNewLeave(l => ({ ...l, start_date: e.target.value }))} /></div>
                                  <div><Label>End Date</Label><Input type="date" value={newLeave.end_date} onChange={e => setNewLeave(l => ({ ...l, end_date: e.target.value }))} /></div>
                                </div>
                                <div><Label>Reason (Internal)</Label><Input value={newLeave.reason} onChange={e => setNewLeave(l => ({ ...l, reason: e.target.value }))} /></div>
                                <Button className="w-full" onClick={submitLeaveRequest}>Submit Request</Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {leaveRequests.map(req => (
                              <div key={req.id} className="flex items-center justify-between text-xs border-b pb-2 last:border-0">
                                <div>
                                  <p className="font-medium capitalize">{req.leave_type.replace("_", " ")}</p>
                                  <p className="text-muted-foreground">{format(new Date(req.start_date), "MMM d")} – {format(new Date(req.end_date), "MMM d")}</p>
                                </div>
                                <Badge variant={req.status === "approved" ? "default" : req.status === "pending" ? "secondary" : "destructive"} className="text-[9px]">
                                  {req.status}
                                </Badge>
                              </div>
                            ))}
                            {leaveRequests.length === 0 && (
                              <p className="text-xs text-muted-foreground text-center py-4 italic">No recent leave requests.</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Performance Appraisals */}
                      <Card>
                        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                          <div>
                            <CardTitle className="text-sm">Performance Appraisals</CardTitle>
                            <CardDescription className="text-xs">Formal reviews and goal setting</CardDescription>
                          </div>
                          <Dialog open={showAppraisalDialog} onOpenChange={setShowAppraisalDialog}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><Plus className="h-4 w-4" /></Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>Formal Performance Review</DialogTitle></DialogHeader>
                              <div className="space-y-3 pt-2">
                                <div className="grid grid-cols-2 gap-3">
                                  <div><Label>Review Date</Label><Input type="date" value={newAppraisal.review_date} onChange={e => setNewAppraisal(a => ({ ...a, review_date: e.target.value }))} /></div>
                                  <div><Label>Overall Rating</Label><Select value={String(newAppraisal.overall_rating)} onValueChange={v => setNewAppraisal(a => ({ ...a, overall_rating: Number(v) }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1 - Poor</SelectItem><SelectItem value="2">2 - Fair</SelectItem><SelectItem value="3">3 - Good</SelectItem><SelectItem value="4">4 - Excellent</SelectItem><SelectItem value="5">5 - Outstanding</SelectItem></SelectContent></Select></div>
                                </div>
                                <div><Label>Key Strengths</Label><Input value={newAppraisal.strengths} onChange={e => setNewAppraisal(a => ({ ...a, strengths: e.target.value }))} placeholder="e.g. Mastered diesel diagnostics..." /></div>
                                <div><Label>Areas for Improvement</Label><Input value={newAppraisal.areas_for_improvement} onChange={e => setNewAppraisal(a => ({ ...a, areas_for_improvement: e.target.value }))} placeholder="e.g. Time management during peak hours..." /></div>
                                <Button className="w-full" onClick={submitAppraisal}>Save Appraisal</Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {appraisals.map(review => (
                              <div key={review.id} className="flex items-center justify-between text-xs border-b pb-2 last:border-0 cursor-pointer hover:bg-muted/50 p-1 rounded transition-colors">
                                <div>
                                  <p className="font-medium">Annual Review {format(new Date(review.review_date), "yyyy")}</p>
                                  <p className="text-muted-foreground">{format(new Date(review.review_date), "MMM d, yyyy")}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star key={i} className={`h-2.5 w-2.5 ${i < review.overall_rating ? "text-yellow-500 fill-yellow-500" : "text-muted"}`} />
                                  ))}
                                </div>
                              </div>
                            ))}
                            {appraisals.length === 0 && (
                              <p className="text-xs text-muted-foreground text-center py-4 italic">No formal reviews on record.</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Emergency Contacts */}
                      <Card>
                        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                          <div>
                            <CardTitle className="text-sm">Emergency Contacts</CardTitle>
                            <CardDescription className="text-xs">Primary contact information</CardDescription>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Plus className="h-4 w-4" /></Button>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {selectedTech.emergency_contact_name ? (
                              <div className="p-3 bg-muted/30 rounded-lg text-sm">
                                <p className="font-medium">{selectedTech.emergency_contact_name}</p>
                                <p className="text-xs text-muted-foreground">{selectedTech.emergency_contact_phone}</p>
                                <Badge variant="outline" className="text-[9px] mt-1">Primary</Badge>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground text-center py-4 italic">No emergency contact set.</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* HR Documents */}
                    <Card>
                      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                        <div>
                          <CardTitle className="text-sm">Personnel Documents</CardTitle>
                          <CardDescription className="text-xs">Secure storage for contracts, DL, and tax forms</CardDescription>
                        </div>
                        <Dialog open={showDocDialog} onOpenChange={setShowDocDialog}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 gap-1.5">
                              <FileText className="h-3.5 w-3.5" /> Upload Doc
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Upload Personnel Document</DialogTitle>
                              <DialogDescription>Securely store certificates, IDs, and contracts.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 pt-2">
                              <div>
                                <Label>Document Type</Label>
                                <Select value={newDoc.document_type} onValueChange={v => setNewDoc(d => ({ ...d, document_type: v }))}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="identity_proof">Identity Proof (Passport/SSN)</SelectItem>
                                    <SelectItem value="drivers_license">Driver's License</SelectItem>
                                    <SelectItem value="tax_form">Tax Form (W4/I9)</SelectItem>
                                    <SelectItem value="employment_contract">Employment Contract</SelectItem>
                                    <SelectItem value="insurance_cert">Insurance Cert</SelectItem>
                                    <SelectItem value="certification_pdf">ASE / Other Certification</SelectItem>
                                    <SelectItem value="other">Other</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>Document Name (Optional)</Label>
                                <Input value={newDoc.document_name} onChange={e => setNewDoc(d => ({ ...d, document_name: e.target.value }))} placeholder="e.g. John_ASE_2026.pdf" />
                              </div>
                              <div>
                                <Label>Expiry Date (if applicable)</Label>
                                <Input type="date" value={newDoc.expiry_date || ""} onChange={e => setNewDoc(d => ({ ...d, expiry_date: e.target.value }))} />
                              </div>
                              <div className="pt-2">
                                <Label htmlFor="doc-upload-input" className="block p-8 border-2 border-dashed rounded-lg text-center cursor-pointer hover:bg-muted/50 transition-colors">
                                  <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                  <p className="text-sm font-medium">Click to select file</p>
                                  <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG up to 10MB</p>
                                  <Input 
                                    id="doc-upload-input" 
                                    type="file" 
                                    className="hidden" 
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={handleDocUpload}
                                  />
                                </Label>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {docs.map(doc => (
                            <div 
                              key={doc.id} 
                              className="p-3 border rounded-lg flex items-start gap-3 hover:border-primary transition-colors cursor-pointer"
                              onClick={() => window.open(doc.file_url, "_blank")}
                            >
                              <div className="p-2 bg-blue-50 text-blue-600 rounded">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="overflow-hidden">
                                <p className="font-medium text-xs truncate">{doc.document_name}</p>
                                <p className="text-[10px] text-muted-foreground uppercase">{doc.document_type.replace("_", " ")}</p>
                                {doc.expiry_date && (
                                  <p className={`text-[9px] mt-1 ${new Date(doc.expiry_date) < new Date() ? "text-red-500 font-bold" : "text-muted-foreground"}`}>
                                    Expires: {format(new Date(doc.expiry_date), "MMM yyyy")}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                          {docs.length === 0 && (
                            <div className="col-span-full py-8 border-dashed border-2 rounded-lg flex flex-col items-center justify-center text-muted-foreground">
                              <Shield className="h-6 w-6 mb-2 opacity-50" />
                              <p className="text-xs">No personnel documents uploaded</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* ── COMPLIANCE TAB ── */}
                  <TabsContent value="compliance" className="space-y-4 mt-4">
                    {/* Compliance Status */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" /> Compliance Checklist
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {[
                          { label: "Insurance Verified", ok: !!selectedTech.insurance_verified },
                          { label: "Background Check Cleared", ok: selectedTech.background_check_status === "cleared" },
                          {
                            label: `License Valid (Exp: ${selectedTech.license_expiration_date ? format(new Date(selectedTech.license_expiration_date), "MMM d, yyyy") : "Not set"})`,
                            ok: !!selectedTech.license_expiration_date && new Date(selectedTech.license_expiration_date) > new Date()
                          },
                          { label: "Skills on File", ok: skills.length > 0 },
                        ].map(({ label, ok }) => (
                          <div key={label} className="flex items-center gap-3">
                            {ok ? <CheckCircle className="h-4 w-4 text-gray-500 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                            <span className={`text-sm ${ok ? "" : "text-red-600"}`}>{label}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    {/* Incidents */}
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Incident Log</h3>
                      <Dialog open={showIncidentDialog} onOpenChange={setShowIncidentDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1.5">
                            <Plus className="h-3.5 w-3.5" /> Log Incident
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Log Incident</DialogTitle></DialogHeader>
                          <div className="space-y-3 pt-2">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label>Date</Label>
                                <Input type="date" value={newIncident.incident_date} onChange={e => setNewIncident(i => ({ ...i, incident_date: e.target.value }))} />
                              </div>
                              <div>
                                <Label>Type</Label>
                                <Select value={newIncident.incident_type} onValueChange={v => setNewIncident(i => ({ ...i, incident_type: v }))}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {["vehicle_accident","customer_complaint","equipment_damage","injury","theft","policy_violation","other"].map(t => (
                                      <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div>
                              <Label>Description</Label>
                              <Input value={newIncident.description} onChange={e => setNewIncident(i => ({ ...i, description: e.target.value }))} placeholder="Describe the incident..." />
                            </div>
                            <div>
                              <Label>Damage Amount ($)</Label>
                              <Input type="number" value={newIncident.damage_amount} onChange={e => setNewIncident(i => ({ ...i, damage_amount: Number(e.target.value) }))} />
                            </div>
                            <Button className="w-full" onClick={logIncident}>Log Incident</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {incidents.length === 0 ? (
                      <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No incidents on record. ✓</CardContent></Card>
                    ) : (
                      <div className="space-y-2">
                        {incidents.map(inc => (
                          <Card key={inc.id} className="shadow-none">
                            <CardContent className="py-3 px-4">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium text-sm capitalize">{inc.incident_type.replace(/_/g, " ")}</p>
                                  <p className="text-xs text-muted-foreground">{format(new Date(inc.incident_date), "MMM d, yyyy")}</p>
                                  <p className="text-sm mt-1">{inc.description}</p>
                                  {inc.damage_amount && <p className="text-xs text-red-600 mt-0.5">Damage: ${inc.damage_amount.toLocaleString()}</p>}
                                </div>
                                <Badge className={
                                  inc.resolution_status === "resolved" ? "bg-gray-100 text-gray-800" :
                                  inc.resolution_status === "escalated" ? "bg-red-100 text-red-800" :
                                  "bg-yellow-100 text-yellow-800"
                                } variant="outline">{inc.resolution_status}</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* ── DISPATCH TAB (Layer 9) ── */}
                  <TabsContent value="dispatch" className="space-y-4 mt-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Zap className="h-4 w-4 text-primary" /> Smart Dispatch Eligibility
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Technician readiness for algorithmic auto-dispatch
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: "Performance Score", value: `${(selectedTech.performance_score || 0).toFixed(0)}/100`, ok: (selectedTech.performance_score || 0) >= 50 },
                            { label: "Skills Certified", value: `${skills.length} skills`, ok: skills.length > 0 },
                            { label: "Insurance Valid", value: selectedTech.insurance_verified ? "Yes" : "No", ok: !!selectedTech.insurance_verified },
                            { label: "BGC Status", value: selectedTech.background_check_status || "pending", ok: selectedTech.background_check_status === "cleared" },
                            { label: "License Valid", value: selectedTech.license_expiration_date ? format(new Date(selectedTech.license_expiration_date), "MMM yyyy") : "Not set", ok: !!selectedTech.license_expiration_date && new Date(selectedTech.license_expiration_date) > new Date() },
                            { label: "Daily Capacity", value: `${selectedTech.max_daily_capacity_hours || 8}h/day`, ok: true },
                          ].map(({ label, value, ok }) => (
                            <div key={label} className="flex items-center justify-between p-2 rounded-lg border">
                              <div className="flex items-center gap-2">
                                {ok ? <CheckCircle className="h-3.5 w-3.5 text-gray-500" /> : <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                                <span className="text-xs text-muted-foreground">{label}</span>
                              </div>
                              <span className={`text-xs font-semibold ${ok ? "text-foreground" : "text-red-600"}`}>{value}</span>
                            </div>
                          ))}
                        </div>

                        <Separator />

                        <div className="p-3 rounded-lg bg-muted/50">
                          <p className="text-xs font-semibold mb-1 flex items-center gap-1">
                            <Activity className="h-3.5 w-3.5" /> Dispatch Priority Formula
                          </p>
                          <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
                            <p>1. Filter: skill match → radius → availability</p>
                            <p>2. Sort: lowest daily load (fairness)</p>
                            <p>3. Tiebreak: highest performance score</p>
                          </div>
                        </div>

                        <Button className="w-full gap-2" onClick={() => navigate("/appointments")}>
                          <Calendar className="h-4 w-4" /> View Dispatch Board
                        </Button>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Add Technician Dialog ── */}
      <Dialog open={showAddTechDialog} onOpenChange={(open) => { setShowAddTechDialog(open); if (!open) resetAddTechForm(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Add Technician
            </DialogTitle>
            <DialogDescription>
              Create one roster record and optionally invite the technician to their app account in the same workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {/* Personal Info */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" /> Personal Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Full Name <span className="text-destructive">*</span></Label>
                  <Input value={addTechForm.name} onChange={e => setAddTechForm(p => ({ ...p, name: e.target.value }))} placeholder="John Smith" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={addTechForm.email} onChange={e => setAddTechForm(p => ({ ...p, email: e.target.value }))} placeholder="john@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input type="tel" value={addTechForm.phone} onChange={e => setAddTechForm(p => ({ ...p, phone: e.target.value }))} placeholder="(555) 123-4567" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Address</Label>
                  <Input value={addTechForm.address} onChange={e => setAddTechForm(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St, City, State" />
                </div>
                <div className="sm:col-span-2 rounded-lg border p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <Checkbox id="send-technician-invite" checked={addTechForm.send_invite} onCheckedChange={(checked) => setAddTechForm(p => ({ ...p, send_invite: checked === true }))} />
                    <div><Label htmlFor="send-technician-invite">Invite to the technician app</Label><p className="text-xs text-muted-foreground">Creates the roster and invitation together. Turn this off for a roster-only technician.</p></div>
                  </div>
                  {addTechForm.send_invite && (
                    <div className="space-y-2">
                      <Label>Workspace role</Label>
                      <Select value={addTechForm.role} onValueChange={role => setAddTechForm(p => ({ ...p, role }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="technician">Technician</SelectItem><SelectItem value="lead_technician">Lead technician</SelectItem>
                          <SelectItem value="dispatcher">Dispatcher</SelectItem><SelectItem value="service_advisor">Service advisor</SelectItem><SelectItem value="manager">Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <Separator />
            {/* Employment */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Briefcase className="h-4 w-4" /> Employment Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Employment Type</Label>
                  <Select value={addTechForm.employment_type} onValueChange={v => setAddTechForm(p => ({ ...p, employment_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="W2">W2 Employee</SelectItem>
                      <SelectItem value="1099">1099 Contractor</SelectItem>
                      <SelectItem value="contractor">Contractor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hourly Rate ($)</Label>
                  <Input type="number" step="0.01" value={addTechForm.hourly_rate} onChange={e => setAddTechForm(p => ({ ...p, hourly_rate: e.target.value }))} placeholder="25.00" />
                </div>
                <div className="space-y-2">
                  <Label>Commission (%)</Label>
                  <Input type="number" step="0.1" value={addTechForm.commission_percentage} onChange={e => setAddTechForm(p => ({ ...p, commission_percentage: e.target.value }))} placeholder="10" />
                </div>
                <div className="space-y-2">
                  <Label>Overtime Rate ($)</Label>
                  <Input type="number" step="0.01" value={addTechForm.overtime_rate} onChange={e => setAddTechForm(p => ({ ...p, overtime_rate: e.target.value }))} placeholder="37.50" />
                </div>
                <div className="space-y-2">
                  <Label>Max Hours/Day</Label>
                  <Input type="number" value={addTechForm.max_daily_capacity_hours} onChange={e => setAddTechForm(p => ({ ...p, max_daily_capacity_hours: e.target.value }))} placeholder="8" />
                </div>
                <div className="space-y-2">
                  <Label>Hire Date</Label>
                  <Input type="date" value={addTechForm.hire_date} onChange={e => setAddTechForm(p => ({ ...p, hire_date: e.target.value }))} />
                </div>
              </div>
            </div>
            <Separator />
            {/* Emergency Contact */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" /> Emergency Contact
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input value={addTechForm.emergency_contact_name} onChange={e => setAddTechForm(p => ({ ...p, emergency_contact_name: e.target.value }))} placeholder="Jane Smith" />
                </div>
                <div className="space-y-2">
                  <Label>Relationship</Label>
                  <Input value={addTechForm.emergency_contact_relationship} onChange={e => setAddTechForm(p => ({ ...p, emergency_contact_relationship: e.target.value }))} placeholder="Spouse" />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input type="tel" value={addTechForm.emergency_contact_phone} onChange={e => setAddTechForm(p => ({ ...p, emergency_contact_phone: e.target.value }))} placeholder="(555) 999-0000" />
                </div>
              </div>
            </div>
            <Separator />
            {/* Driver's License */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" /> Driver's License
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>License Number</Label>
                  <Input value={addTechForm.drivers_license_number} onChange={e => setAddTechForm(p => ({ ...p, drivers_license_number: e.target.value }))} placeholder="DL1234567" />
                </div>
                <div className="space-y-2">
                  <Label>Expiry Date</Label>
                  <Input type="date" value={addTechForm.drivers_license_expiry} onChange={e => setAddTechForm(p => ({ ...p, drivers_license_expiry: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowAddTechDialog(false); resetAddTechForm(); }}>Cancel</Button>
            <Button onClick={handleAddTechnician} disabled={addingTech} className="gap-2">
              {addingTech ? <><RefreshCw className="h-4 w-4 animate-spin" /> Creating…</> : <><Plus className="h-4 w-4" /> {addTechForm.send_invite ? "Add & Invite" : "Add to Roster"}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
