/**
 * TeamDashboard - Dedicated dashboard for team members (technicians)
 * 
 * Features:
 * - View assigned appointments
 * - Update personal profile (NAP, working hours, license)
 * - Clock in/out
 * - Update job status
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAuthUser,
  fetchTechProfile,
  fetchTeamAssignments,
  type TechProfile,
  type TeamAssignment,
} from "@/application/queries/team-dashboard.query";
import {
  updateTechProfile,
  updateAppointmentDispatchStatus,
  signOutUser,
  uploadDriversLicense,
} from "@/application/commands/team-dashboard.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Clock,
  User,
  Wrench,
  MapPin,
  Phone,
  Mail,
  LogOut,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Car,
  Upload,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, isToday, isFuture } from "date-fns";
import { getSemanticStatus } from "@/lib/semantic-status";

interface Assignment extends TeamAssignment {}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const TeamDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<TechProfile | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [saving, setSaving] = useState(false);
  const [editProfile, setEditProfile] = useState<Partial<TechProfile>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const user = await getAuthUser();
      if (!user) {
        navigate("/login");
        return;
      }

      const tech = await fetchTechProfile(user.id);
      if (!tech) {
        toast.error("No team member profile found. Please contact your manager.");
        navigate("/login");
        return;
      }

      setProfile(tech);
      setEditProfile(tech);

      const appts = await fetchTeamAssignments(tech.id);
      setAssignments(appts as Assignment[]);
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await updateTechProfile(profile.id, editProfile);
      toast.success("Profile updated");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (appointmentId: string, newStatus: string) => {
    try {
      await updateAppointmentDispatchStatus(appointmentId, newStatus);
      toast.success("Status updated");
      fetchData();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    navigate("/login");
  };

  const handleLicenseUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile || !e.target.files?.[0]) return;
    try {
      await uploadDriversLicense(profile.user_id, profile.id, e.target.files[0]);
      toast.success("License uploaded");
      fetchData();
    } catch {
      toast.error("Upload failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) return null;

  const todayJobs = assignments.filter(a => isToday(parseISO(a.scheduled_date)));
  const upcomingJobs = assignments.filter(a => isFuture(parseISO(a.scheduled_date)) && !isToday(parseISO(a.scheduled_date)));

  const getStatusColor = (status: string | null) =>
    getSemanticStatus("appointment", status).badgeClass;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {profile.name.split(" ").map(n => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{profile.name}</p>
              <p className="text-xs text-muted-foreground">Team Member</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        <Tabs defaultValue="appointments">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="appointments" className="gap-2">
              <Calendar className="h-4 w-4" /> My Appointments
            </TabsTrigger>
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" /> My Profile
            </TabsTrigger>
          </TabsList>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="space-y-6 mt-6">
            {/* Today's Jobs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Today's Jobs ({todayJobs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {todayJobs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No jobs scheduled for today</p>
                ) : (
                  <div className="space-y-3">
                    {todayJobs.map(job => (
                      <div key={job.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{job.title}</p>
                            <p className="text-sm text-muted-foreground">{job.scheduled_time} · {job.duration_minutes} min</p>
                          </div>
                          <Badge className={getStatusColor(job.dispatch_status)}>
                            {(job.dispatch_status || job.status).replace("_", " ")}
                          </Badge>
                        </div>
                        {job.guest_name && (
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><User className="h-3 w-3" />{job.guest_name}</span>
                            {job.guest_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{job.guest_phone}</span>}
                          </div>
                        )}
                        {job.description && <p className="text-sm">{job.description}</p>}
                        <div className="flex gap-2 pt-2">
                          {job.dispatch_status !== "en_route" && job.dispatch_status !== "in_progress" && job.dispatch_status !== "completed" && (
                            <Button size="sm" variant="outline" onClick={() => handleStatusUpdate(job.id, "en_route")}>
                              En Route
                            </Button>
                          )}
                          {job.dispatch_status === "en_route" && (
                            <Button size="sm" variant="outline" onClick={() => handleStatusUpdate(job.id, "in_progress")}>
                              Start Job
                            </Button>
                          )}
                          {job.dispatch_status === "in_progress" && (
                            <Button size="sm" onClick={() => handleStatusUpdate(job.id, "completed")}>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Complete
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Jobs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Upcoming ({upcomingJobs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingJobs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No upcoming jobs</p>
                ) : (
                  <div className="space-y-2">
                    {upcomingJobs.slice(0, 10).map(job => (
                      <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{job.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(job.scheduled_date), "EEE, MMM d")} at {job.scheduled_time}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {job.dispatch_status || job.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" /> Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={profile.name} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={profile.email || ""} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={editProfile.phone || ""}
                      onChange={e => setEditProfile(p => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input
                      value={editProfile.address || ""}
                      onChange={e => setEditProfile(p => ({ ...p, address: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Car className="h-5 w-5" /> Driver's License
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>License Number</Label>
                    <Input
                      value={editProfile.drivers_license_number || ""}
                      onChange={e => setEditProfile(p => ({ ...p, drivers_license_number: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry Date</Label>
                    <Input
                      type="date"
                      value={editProfile.drivers_license_expiry || ""}
                      onChange={e => setEditProfile(p => ({ ...p, drivers_license_expiry: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="team-license-upload" className="cursor-pointer">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors w-fit">
                      <Upload className="h-4 w-4" />
                      Upload License
                    </div>
                    <Input id="team-license-upload" type="file" accept="image/*,.pdf" className="hidden" onChange={handleLicenseUpload} />
                  </Label>
                  {profile.drivers_license_url && (
                    <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Document uploaded
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" /> Emergency Contact
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Name</Label>
                    <Input
                      value={editProfile.emergency_contact_name || ""}
                      onChange={e => setEditProfile(p => ({ ...p, emergency_contact_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input
                      type="tel"
                      value={editProfile.emergency_contact_phone || ""}
                      onChange={e => setEditProfile(p => ({ ...p, emergency_contact_phone: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5" /> My Working Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {DAYS.map(day => {
                    const hours = editProfile.working_hours?.[day] || { start: "08:00", end: "17:00" };
                    return (
                      <div key={day} className="flex items-center gap-3">
                        <span className="w-24 text-sm capitalize">{day}</span>
                        <Input
                          type="time"
                          className="w-28"
                          value={hours.start}
                          onChange={e => {
                            setEditProfile(p => ({
                              ...p,
                              working_hours: {
                                ...(p.working_hours || {}),
                                [day]: { ...hours, start: e.target.value },
                              },
                            }));
                          }}
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                          type="time"
                          className="w-28"
                          value={hours.end}
                          onChange={e => {
                            setEditProfile(p => ({
                              ...p,
                              working_hours: {
                                ...(p.working_hours || {}),
                                [day]: { ...hours, end: e.target.value },
                              },
                            }));
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveProfile} disabled={saving} className="gap-2 w-full sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Profile
            </Button>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default TeamDashboard;
