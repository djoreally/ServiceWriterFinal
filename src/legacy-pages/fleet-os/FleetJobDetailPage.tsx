import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@packages/auth";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Loader2,
  MapPin,
  Pencil,
  Save,
  UserRound,
  X,
} from "lucide-react";
import { fetchFleetJobDetail, type FleetJobDetail } from "@/application";
import { assignFleetJob } from "@/application/commands/fleet-jobs.command";
import { fetchAssignableTechnicians, type FleetTechnicianSummary } from "@/application/queries/fleet.query";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";

function orderEstimate(order: FleetJobDetail["work_orders"][number]): number {
  const record = order as unknown as { estimated_cost?: number | null; total_cost?: number | null };
  return Number(record.estimated_cost ?? record.total_cost ?? 0);
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "secondary",
  assigned: "secondary",
  in_progress: "default",
  completed: "outline",
  cancelled: "destructive",
};

const FleetJobDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState<FleetJobDetail | null>(null);
  const [technicians, setTechnicians] = useState<FleetTechnicianSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ technicianId: "", date: "", start: "", duration: "60" });

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    try {
      const [detail, techs] = await Promise.all([
        fetchFleetJobDetail(id),
        fetchAssignableTechnicians(),
      ]);
      setJob(detail);
      setTechnicians(techs);
      setForm({
        technicianId: detail.assigned_technician_id || "",
        date: detail.scheduled_date || "",
        start: detail.scheduled_time?.slice(0, 5) || "08:00",
        duration: "60",
      });
    } catch (error) {
      console.error("[FleetJobDetail] load failed", error);
      toast.error("Could not load fleet job");
    } finally {
      setLoading(false);
    }
  }, [user?.id, id]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const orders = job?.work_orders ?? [];
    return {
      count: orders.length,
      completed: orders.filter((order) => order.status === "completed").length,
      estimated: orders.reduce((sum, order) => sum + orderEstimate(order), 0),
    };
  }, [job]);

  const save = async () => {
    if (!job || !form.technicianId || !form.date) {
      toast.error("Choose a technician and date");
      return;
    }
    setSaving(true);
    try {
      const updated = await assignFleetJob({
        jobId: job.id,
        technicianId: form.technicianId,
        date: form.date,
        start: form.start,
        durationMinutes: Number(form.duration),
      });
      toast.success(`Job assigned — ${updated} work orders updated`);
      setEditing(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to assign job");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <FleetOSLayout title="Fleet job">
        <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      </FleetOSLayout>
    );
  }

  if (!job) {
    return (
      <FleetOSLayout title="Fleet job">
        <Card className="mx-auto max-w-lg p-8 text-center">
          <p className="font-semibold">Fleet job not found</p>
          <p className="mt-2 text-sm text-muted-foreground">It may have been removed or you may not have access.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/fleet-os/scheduler")}>Back to scheduler</Button>
        </Card>
      </FleetOSLayout>
    );
  }

  return (
    <FleetOSLayout title={job.job_number || "Fleet job"}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">{job.job_number || "Fleet job"}</h1>
                <Badge variant={STATUS_VARIANT[job.status] ?? "secondary"} className="capitalize">{job.status.replace(/_/g, " ")}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{totals.count} vehicles · {totals.completed} completed</p>
            </div>
          </div>
          <Button onClick={() => setEditing((current) => !current)} variant={editing ? "outline" : "default"}>
            {editing ? <X className="mr-2 h-4 w-4" /> : <Pencil className="mr-2 h-4 w-4" />}
            {editing ? "Close editor" : "Assign / reschedule"}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Client</CardTitle></CardHeader>
            <CardContent>
              <p className="font-semibold">{job.fleet_clients?.company_name || "Fleet client"}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {[job.fleet_locations?.name, job.fleet_locations?.address, job.fleet_locations?.city, job.fleet_locations?.state].filter(Boolean).join(", ") || "Location pending"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Schedule</CardTitle></CardHeader>
            <CardContent>
              <p className="flex items-center gap-1.5 font-semibold"><CalendarDays className="h-4 w-4 text-muted-foreground" />{job.scheduled_date || "Unscheduled"}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{job.scheduled_time?.slice(0, 5) || "Time pending"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Technician</CardTitle></CardHeader>
            <CardContent>
              <p className="flex items-center gap-1.5 font-semibold"><UserRound className="h-4 w-4 text-muted-foreground" />{job.technicians?.name || "Unassigned"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Estimated ${totals.estimated.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        {editing ? (
          <Card>
            <CardHeader><CardTitle className="text-base">Assign job</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-4">
              <div><Label>Date</Label><Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} /></div>
              <div><Label>Start time</Label><Input type="time" value={form.start} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} /></div>
              <div>
                <Label>Duration (per vehicle)</Label>
                <Select value={form.duration} onValueChange={(duration) => setForm((current) => ({ ...current, duration }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[30, 45, 60, 90, 120, 180, 240].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Technician</Label>
                <Select value={form.technicianId} onValueChange={(technicianId) => setForm((current) => ({ ...current, technicianId }))}>
                  <SelectTrigger><SelectValue placeholder="Choose technician" /></SelectTrigger>
                  <SelectContent>{technicians.map((tech) => <SelectItem key={tech.id} value={tech.id}>{tech.name || "Technician"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Cascades technician, date, and time to all {totals.count} vehicles in one step.</p>
                <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save assignment</Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader><CardTitle className="text-base">Vehicles in this job</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work order</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Estimate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.work_orders.map((order) => (
                  <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/fleet-os/work-orders/${order.id}`)}>
                    <TableCell className="font-medium">
                      <Link to={`/fleet-os/work-orders/${order.id}`} className="hover:text-primary hover:underline" onClick={(event) => event.stopPropagation()}>
                        {order.order_number || "Work order"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {order.fleet_vehicles
                        ? [order.fleet_vehicles.unit_number ? `Unit ${order.fleet_vehicles.unit_number}` : null, order.fleet_vehicles.year, order.fleet_vehicles.make, order.fleet_vehicles.model].filter(Boolean).join(" · ")
                        : "Vehicle pending"}
                    </TableCell>
                    <TableCell>{order.service_type || "Service"}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[order.status] ?? "secondary"} className="capitalize">{order.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-right">${orderEstimate(order).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {job.notes ? (
          <Card>
            <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.notes}</p></CardContent>
          </Card>
        ) : null}
      </div>
    </FleetOSLayout>
  );
};

export default FleetJobDetailPage;
