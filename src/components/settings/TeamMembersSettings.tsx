/**
 * TeamMembersSettings - Manage team members from Settings page
 * 
 * Features:
 * - List all team members (technicians)
 * - Invite new members via email
 * - Edit member details (NAP, working hours, driver's license)
 * - View invitation status
 */

import { useState, useEffect, useCallback } from "react";
import {
  getAuthUser,
  fetchTeamMembers,
  fetchTeamInvitations,
  getTeamDocumentUrl,
} from "@/application/queries/team-members.query";
import {
  addTechnician,
  createTeamInvitation,
  cancelTeamInvitation,
  updateTechnician,
  uploadTeamDocument,
  deleteTechnician,
} from "@/application/commands/team-members.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  UserPlus,
  Mail,
  Phone,
  MapPin,
  Clock,
  Shield,
  Upload,
  Loader2,
  Trash2,
  Edit,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Car,
  DollarSign,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  status: string;
  is_active: boolean | null;
  skills: string[] | null;
  working_hours: Record<string, { start: string; end: string }> | null;
  auth_user_id: string | null;
  drivers_license_url: string | null;
  drivers_license_number: string | null;
  drivers_license_expiry: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  hourly_rate: number | null;
  hire_date: string | null;
  max_jobs_per_day: number | null;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function TeamMembersSettings() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // Invite form
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("technician");

  // Add technician form
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    employment_type: "W2",
    hourly_rate: "",
    hire_date: "",
    max_jobs_per_day: "",
    drivers_license_number: "",
    drivers_license_expiry: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
  });

  // Edit form
  const [editForm, setEditForm] = useState<Partial<TeamMember>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const user = await getAuthUser();
      if (!user) return;

      const workspaceId = getSelectedWorkspaceId();
      const [techResult, invResult] = await Promise.all([
        fetchTeamMembers(user.id),
        workspaceId ? fetchTeamInvitations(workspaceId) : Promise.resolve({ data: [], error: null }),
      ]);

      if (techResult.data) {
        setMembers(techResult.data.map(t => ({
          ...t,
          is_active: t.is_active ?? true,
          working_hours: t.working_hours as TeamMember["working_hours"],
          skills: t.skills ?? [],
          address: (t as any).address ?? null,
          auth_user_id: (t as any).auth_user_id ?? null,
          drivers_license_url: (t as any).drivers_license_url ?? null,
          drivers_license_number: (t as any).drivers_license_number ?? null,
          drivers_license_expiry: (t as any).drivers_license_expiry ?? null,
          emergency_contact_name: (t as any).emergency_contact_name ?? null,
          emergency_contact_phone: (t as any).emergency_contact_phone ?? null,
          hourly_rate: (t as any).hourly_rate ?? null,
          hire_date: (t as any).hire_date ?? null,
        })));
      }
      if (invResult.data) {
        setInvitations(invResult.data as unknown as Invitation[]);
      }
    } catch (err) {
      console.error("[TeamMembers] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetAddForm = () => setAddForm({
    name: "", email: "", phone: "", address: "", employment_type: "W2",
    hourly_rate: "", hire_date: "", max_jobs_per_day: "",
    drivers_license_number: "", drivers_license_expiry: "",
    emergency_contact_name: "", emergency_contact_phone: "",
  });

  const handleAddTechnician = async () => {
    if (!addForm.name.trim()) {
      toast.error("Full name is required");
      return;
    }
    setAdding(true);
    try {
      const user = await getAuthUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await addTechnician(user.id, {
        name: addForm.name.trim(),
        email: addForm.email.trim() || null,
        phone: addForm.phone.trim() || null,
        status: "offline",
        is_active: true,
        address: addForm.address.trim() || null,
        hourly_rate: addForm.hourly_rate ? parseFloat(addForm.hourly_rate) : null,
        hire_date: addForm.hire_date || null,
        max_jobs_per_day: addForm.max_jobs_per_day ? parseInt(addForm.max_jobs_per_day) : null,
        drivers_license_number: addForm.drivers_license_number.trim() || null,
        drivers_license_expiry: addForm.drivers_license_expiry || null,
        emergency_contact_name: addForm.emergency_contact_name.trim() || null,
        emergency_contact_phone: addForm.emergency_contact_phone.trim() || null,
      });

      if (error) throw error;
      toast.success(`${addForm.name} added to your team`);
      setShowAddDialog(false);
      resetAddForm();
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to add technician");
    } finally {
      setAdding(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setInviting(true);
    try {
      const user = await getAuthUser();
      if (!user) throw new Error("Not authenticated");

      const workspaceId = getSelectedWorkspaceId();
      if (!workspaceId) throw new Error("Select a workspace before inviting a team member");

      const { data: invitationResponse, error } = await createTeamInvitation(
        workspaceId,
        inviteEmail.trim().toLowerCase(),
        inviteName.trim(),
        inviteRole,
      );

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === "invitation_pending" || code === "23505") {
          toast.error("This email has already been invited");
        } else {
          throw error;
        }
        setInviting(false);
        return;
      }

      if (invitationResponse?.delivery.status === "failed") {
        toast.warning("Invitation created, but the email could not be sent. You can resend it from the invitation list.");
      } else {
        toast.success(`Invitation sent to ${inviteEmail}`);
      }

      setShowInviteDialog(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("technician");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleCancelInvitation = async (invId: string) => {
    const { error } = await cancelTeamInvitation(invId);

    if (error) {
      toast.error("Failed to cancel invitation");
    } else {
      toast.success("Invitation cancelled");
      fetchData();
    }
  };

  const handleEditMember = (member: TeamMember) => {
    setSelectedMember(member);
    setEditForm({
      name: member.name,
      email: member.email,
      phone: member.phone,
      address: member.address,
      hourly_rate: member.hourly_rate,
      max_jobs_per_day: member.max_jobs_per_day,
      hire_date: member.hire_date,
      drivers_license_number: member.drivers_license_number,
      drivers_license_expiry: member.drivers_license_expiry,
      emergency_contact_name: member.emergency_contact_name,
      emergency_contact_phone: member.emergency_contact_phone,
      is_active: member.is_active,
      working_hours: member.working_hours,
    });
    setShowEditDialog(true);
  };

  const handleSaveMember = async () => {
    if (!selectedMember) return;
    setSaving(true);
    try {
      const { error } = await updateTechnician(selectedMember.id, {
        name: editForm.name || selectedMember.name,
        email: editForm.email,
        phone: editForm.phone,
        is_active: editForm.is_active,
        max_jobs_per_day: editForm.max_jobs_per_day,
        working_hours: editForm.working_hours as unknown as import("@/integrations/supabase/types").Json,
        address: editForm.address,
        hourly_rate: editForm.hourly_rate,
        hire_date: editForm.hire_date,
        drivers_license_number: editForm.drivers_license_number,
        drivers_license_expiry: editForm.drivers_license_expiry,
        emergency_contact_name: editForm.emergency_contact_name,
        emergency_contact_phone: editForm.emergency_contact_phone,
      } as any);

      if (error) throw error;
      toast.success("Team member updated");
      setShowEditDialog(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedMember || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const user = await getAuthUser();
    if (!user) return;

    const filePath = `${user.id}/${selectedMember.id}/drivers-license.${file.name.split('.').pop()}`;
    const { error: uploadError } = await uploadTeamDocument(filePath, file);

    if (uploadError) {
      toast.error("Upload failed");
      return;
    }

    const { data: { publicUrl } } = getTeamDocumentUrl(filePath);

    await updateTechnician(selectedMember.id, { drivers_license_url: publicUrl } as any);

    toast.success("Driver's license uploaded");
    fetchData();
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!confirm("Are you sure you want to remove this team member?")) return;
    const { error } = await updateTechnician(memberId, { is_active: false } as any);
    
    if (error) {
      toast.error("Failed to remove member");
    } else {
      toast.success("Team member deactivated");
      fetchData();
    }
  };

  const getWorkingHoursForDay = (day: string) => {
    if (!editForm.working_hours) return { start: "08:00", end: "17:00" };
    return editForm.working_hours[day] || { start: "08:00", end: "17:00" };
  };

  const setWorkingHoursForDay = (day: string, field: "start" | "end", value: string) => {
    setEditForm(prev => ({
      ...prev,
      working_hours: {
        ...(prev.working_hours || {}),
        [day]: {
          ...getWorkingHoursForDay(day),
          [field]: value,
        },
      },
    }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const activeMembers = members.filter(m => m.is_active !== false);
  const pendingInvitations = invitations.filter(i => i.status === "pending");

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                Manage your team members, their schedules, and permissions
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowAddDialog(true)} className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Technician
              </Button>
              <Button onClick={() => setShowInviteDialog(true)} className="gap-2">
                <Send className="h-4 w-4" />
                Invite via Email
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pending Invitations */}
          {pendingInvitations.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Send className="h-4 w-4" />
                Pending Invitations ({pendingInvitations.length})
              </h4>
              <div className="space-y-2">
                {pendingInvitations.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{inv.name}</p>
                        <p className="text-xs text-muted-foreground">{inv.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelInvitation(inv.id)}
                      >
                        <XCircle className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Separator />
            </div>
          )}

          {/* Active Members */}
          {activeMembers.length === 0 && pendingInvitations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No team members yet</p>
              <p className="text-sm mt-1">Invite your first team member to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeMembers.map(member => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {member.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {member.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {member.email}
                          </span>
                        )}
                        {member.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {member.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={member.auth_user_id ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {member.auth_user_id ? (
                        <><CheckCircle2 className="h-3 w-3 mr-1" /> Active</>
                      ) : (
                        "Not linked"
                      )}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => handleEditMember(member)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteMember(member.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Technician Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) resetAddForm(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Add Technician
            </DialogTitle>
            <DialogDescription>
              Manually add a technician to your team. They won't need to create an account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" /> Personal Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Full Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={addForm.name}
                    onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="John Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={addForm.email}
                    onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={addForm.phone}
                    onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={addForm.address}
                    onChange={e => setAddForm(p => ({ ...p, address: e.target.value }))}
                    placeholder="123 Main St, City, State"
                  />
                </div>
              </div>
            </div>
            <Separator />
            {/* Employment */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Employment Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Employment Type</Label>
                  <Select value={addForm.employment_type} onValueChange={v => setAddForm(p => ({ ...p, employment_type: v }))}>
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
                  <Input
                    type="number"
                    step="0.01"
                    value={addForm.hourly_rate}
                    onChange={e => setAddForm(p => ({ ...p, hourly_rate: e.target.value }))}
                    placeholder="25.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hire Date</Label>
                  <Input
                    type="date"
                    value={addForm.hire_date}
                    onChange={e => setAddForm(p => ({ ...p, hire_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Jobs/Day</Label>
                  <Input
                    type="number"
                    value={addForm.max_jobs_per_day}
                    onChange={e => setAddForm(p => ({ ...p, max_jobs_per_day: e.target.value }))}
                    placeholder="8"
                  />
                </div>
              </div>
            </div>
            <Separator />
            {/* Emergency Contact */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" /> Emergency Contact
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input
                    value={addForm.emergency_contact_name}
                    onChange={e => setAddForm(p => ({ ...p, emergency_contact_name: e.target.value }))}
                    placeholder="Jane Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input
                    type="tel"
                    value={addForm.emergency_contact_phone}
                    onChange={e => setAddForm(p => ({ ...p, emergency_contact_phone: e.target.value }))}
                    placeholder="(555) 999-0000"
                  />
                </div>
              </div>
            </div>
            <Separator />
            {/* Driver's License */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Car className="h-4 w-4" /> Driver's License
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>License Number</Label>
                  <Input
                    value={addForm.drivers_license_number}
                    onChange={e => setAddForm(p => ({ ...p, drivers_license_number: e.target.value }))}
                    placeholder="DL1234567"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={addForm.drivers_license_expiry}
                    onChange={e => setAddForm(p => ({ ...p, drivers_license_expiry: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetAddForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleAddTechnician} disabled={adding} className="gap-2">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Add Technician
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Invite Team Member
            </DialogTitle>
            <DialogDescription>
              Send an invitation email. They'll create an account and be linked to your team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technician">Technician</SelectItem>
                  <SelectItem value="lead_technician">Lead Technician</SelectItem>
                  <SelectItem value="service_advisor">Service Advisor</SelectItem>
                  <SelectItem value="dispatcher">Dispatcher</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviting} className="gap-2">
              {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit Team Member
            </DialogTitle>
            <DialogDescription>
              Update {selectedMember?.name}'s profile, schedule, and documents
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" /> Personal Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    value={editForm.name || ""}
                    onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editForm.email || ""}
                    onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    type="tel"
                    value={editForm.phone || ""}
                    onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={editForm.address || ""}
                    onChange={e => setEditForm(p => ({ ...p, address: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Employment */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Employment Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Hourly Rate ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.hourly_rate || ""}
                    onChange={e => setEditForm(p => ({ ...p, hourly_rate: parseFloat(e.target.value) || null }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Jobs/Day</Label>
                  <Input
                    type="number"
                    value={editForm.max_jobs_per_day || ""}
                    onChange={e => setEditForm(p => ({ ...p, max_jobs_per_day: parseInt(e.target.value) || null }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hire Date</Label>
                  <Input
                    type="date"
                    value={editForm.hire_date || ""}
                    onChange={e => setEditForm(p => ({ ...p, hire_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <Switch
                  checked={editForm.is_active !== false}
                  onCheckedChange={v => setEditForm(p => ({ ...p, is_active: v }))}
                />
                <Label>Active team member</Label>
              </div>
            </div>

            <Separator />

            {/* Emergency Contact */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" /> Emergency Contact
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input
                    value={editForm.emergency_contact_name || ""}
                    onChange={e => setEditForm(p => ({ ...p, emergency_contact_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input
                    type="tel"
                    value={editForm.emergency_contact_phone || ""}
                    onChange={e => setEditForm(p => ({ ...p, emergency_contact_phone: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Driver's License */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Car className="h-4 w-4" /> Driver's License
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>License Number</Label>
                  <Input
                    value={editForm.drivers_license_number || ""}
                    onChange={e => setEditForm(p => ({ ...p, drivers_license_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expiry Date</Label>
                  <Input
                    type="date"
                    value={editForm.drivers_license_expiry || ""}
                    onChange={e => setEditForm(p => ({ ...p, drivers_license_expiry: e.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-3">
                <Label htmlFor="license-upload" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors w-fit">
                    <Upload className="h-4 w-4" />
                    Upload License Document
                  </div>
                  <Input
                    id="license-upload"
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleLicenseUpload}
                  />
                </Label>
                {selectedMember?.drivers_license_url && (
                  <p className="text-xs text-success mt-1 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> License document uploaded
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Working Hours */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Working Hours
              </h4>
              <div className="space-y-2">
                {DAYS.map(day => (
                  <div key={day} className="flex items-center gap-3">
                    <span className="w-24 text-sm capitalize">{day}</span>
                    <Input
                      type="time"
                      className="w-28"
                      value={getWorkingHoursForDay(day).start}
                      onChange={e => setWorkingHoursForDay(day, "start", e.target.value)}
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="time"
                      className="w-28"
                      value={getWorkingHoursForDay(day).end}
                      onChange={e => setWorkingHoursForDay(day, "end", e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveMember} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
