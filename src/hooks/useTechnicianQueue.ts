import { useState } from "react";
import { format } from "date-fns";

const defaultSkill = {
  skill_type: "",
  certification_level: "basic",
  years_experience: 0,
  certified_by: "",
  expiration_date: "",
};

const defaultPayroll = {
  cycle_start: "",
  cycle_end: "",
  total_hours: 0,
  total_jobs: 0,
  gross_revenue_generated: 0,
  bonuses: 0,
  deductions: 0,
  payout_status: "pending",
};

const buildDefaultIncident = () => ({
  incident_date: format(new Date(), "yyyy-MM-dd"),
  incident_type: "other",
  description: "",
  damage_amount: 0,
  resolution_status: "open",
});

export function useTechnicianQueue() {
  const [showSkillDialog, setShowSkillDialog] = useState(false);
  const [showPayrollDialog, setShowPayrollDialog] = useState(false);
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const [newSkill, setNewSkill] = useState(defaultSkill);
  const [newPayroll, setNewPayroll] = useState(defaultPayroll);
  const [newIncident, setNewIncident] = useState(buildDefaultIncident);

  const resetNewSkill = () => setNewSkill(defaultSkill);
  const resetNewPayroll = () => setNewPayroll(defaultPayroll);
  const resetNewIncident = () => setNewIncident(buildDefaultIncident());

  return {
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
  };
}
