import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTechnicianRoster, type TechnicianRosterRow } from "@/application/queries/technician-os.query";
import { Briefcase, CheckCircle2, Plus, UserRound, Users, Wrench } from "lucide-react";
import { toast } from "@/components/ui/sonner";

export default function TechnicianOS() {
  const navigate = useNavigate();
  const [technicians, setTechnicians] = useState<TechnicianRosterRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchTechnicianRoster();
      if (error) throw error;
      setTechnicians(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load technicians");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const active = technicians.filter((tech) => tech.is_active);
  const assignedToday = active.reduce((sum, tech) => sum + tech.jobs_today, 0);
  const completedToday = active.reduce((sum, tech) => sum + tech.completed_today, 0);

  return (
    <AppLayout title="Technician Hub">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Technician Hub</h1>
            <p className="text-sm text-muted-foreground">Active Service Writer team members and today&apos;s assigned workload.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/command-center")}>Dispatch</Button>
            <Button onClick={() => navigate("/invitations")}>
              <Plus className="mr-2 h-4 w-4" /> Invite Technician
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Active Technicians" value={active.length} icon={<Users className="h-4 w-4" />} />
          <Metric label="Jobs Assigned Today" value={assignedToday} icon={<Briefcase className="h-4 w-4" />} />
          <Metric label="Completed Today" value={completedToday} icon={<CheckCircle2 className="h-4 w-4" />} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Roster</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full" />) : null}
            {!loading && technicians.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No technicians are configured for this workspace.</div>
            ) : null}
            {!loading && technicians.map((tech) => (
              <div key={tech.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted p-2">
                    <UserRound className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{tech.name}</p>
                      <Badge variant="outline" className="capitalize">{tech.role.replace("_", " ")}</Badge>
                      <Badge variant={tech.is_active ? "secondary" : "outline"}>{tech.is_active ? "Active" : "Inactive"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{tech.phone || "No phone on file"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-5 text-sm">
                  <div className="text-center">
                    <p className="font-semibold">{tech.jobs_today}</p>
                    <p className="text-xs text-muted-foreground">Today</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">{tech.active_jobs}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">{tech.completed_today}</p>
                    <p className="text-xs text-muted-foreground">Done</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate("/command-center")}>
                    <Wrench className="mr-1 h-3 w-3" /> Dispatch
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Payroll, HR documents, compliance, van assignments, and technician GPS are intentionally outside the rebuilt Service Writer core until their canonical models are designed. They no longer block Dispatch or service execution.
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}
