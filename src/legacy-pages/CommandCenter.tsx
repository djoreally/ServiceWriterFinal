import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuickDispatchPanel } from "@/components/command-center/QuickDispatchPanel";
import { InlineServiceWriter } from "@/components/command-center/InlineServiceWriter";
import { fetchTodayJobs, fetchActiveTechnicians } from "@/application/queries/command-center.query";
import type { OperationalJobRow } from "@/application/queries/operational-jobs.query";
import { buildCommandCenterBuckets } from "@/lib/command-center-filters";
import { format } from "date-fns";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Plus, Radio, UserRound, Wrench } from "lucide-react";
import { toast } from "sonner";

interface QueueJob extends OperationalJobRow {
  id: string;
  technician_name: string | null;
}

type TabKey = "queue" | "active" | "completed" | "cancelled";

type Tech = {
  id: string;
  name: string;
  status: string;
  avatar_url: string | null;
  current_location: null;
  jobs_today: number;
};

type CommandCenterProps = { embedded?: boolean };

export default function CommandCenter({ embedded = false }: CommandCenterProps) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("queue");
  const [selectedJob, setSelectedJob] = useState<QueueJob | null>(null);
  const [showNewJob, setShowNewJob] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const [jobsRes, techsRes] = await Promise.all([
        fetchTodayJobs("", today),
        fetchActiveTechnicians(""),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (techsRes.error) throw techsRes.error;

      const normalizedJobs: QueueJob[] = ((jobsRes.data ?? []) as OperationalJobRow[]).map((job) => ({
        ...job,
        id: job.job_id,
        technician_name: job.assigned_technician_name ?? null,
      }));
      setJobs(normalizedJobs);

      const counts = new Map<string, number>();
      normalizedJobs.forEach((job) => {
        if (job.assigned_technician_id) counts.set(job.assigned_technician_id, (counts.get(job.assigned_technician_id) ?? 0) + 1);
      });
      setTechs(((techsRes.data ?? []) as any[]).map((tech) => ({
        ...tech,
        current_location: null,
        jobs_today: counts.get(tech.id) ?? 0,
      })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load Dispatch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const buckets = useMemo(() => buildCommandCenterBuckets(jobs), [jobs]);
  const visible = activeTab === "queue"
    ? buckets.queue
    : activeTab === "active"
      ? buckets.active
      : activeTab === "completed"
        ? buckets.completed
        : buckets.cancelled;

  const openJob = (job: QueueJob) => {
    if (!job.assigned_technician_id && activeTab === "queue") {
      setSelectedJob(job);
      return;
    }
    if (job.source === "appointment") navigate(`/appointments/${job.id}`);
    else navigate("/services");
  };

  const content = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Dispatch</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Appointments and repair orders in one Service Writer command center.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/appointments")}>
            <CalendarClock className="mr-2 h-4 w-4" /> Appointments
          </Button>
          <Button onClick={() => { setShowNewJob(true); setSelectedJob(null); }}>
            <Plus className="mr-2 h-4 w-4" /> New Job
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Unassigned" value={buckets.queue.length} icon={<AlertTriangle className="h-4 w-4" />} />
        <Stat label="Active" value={buckets.active.length} icon={<Wrench className="h-4 w-4" />} />
        <Stat label="Completed" value={buckets.completed.length} icon={<CheckCircle2 className="h-4 w-4" />} />
        <Stat label="Technicians" value={techs.length} icon={<UserRound className="h-4 w-4" />} />
      </div>

      <div className="grid min-h-[600px] gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="p-0">
            <div className="border-b px-4 pt-4">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="queue">Queue {buckets.queue.length}</TabsTrigger>
                  <TabsTrigger value="active">Active {buckets.active.length}</TabsTrigger>
                  <TabsTrigger value="completed">Done {buckets.completed.length}</TabsTrigger>
                  <TabsTrigger value="cancelled">Cancelled {buckets.cancelled.length}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-2 p-3">
              {loading ? Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />) : null}
              {!loading && visible.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">No jobs in this bucket.</div>
              ) : null}
              {!loading && visible.map((job) => (
                <button key={`${job.source}:${job.id}`} type="button" onClick={() => openJob(job)} className="w-full rounded-lg border bg-card p-3 text-left transition hover:bg-accent/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{job.scheduled_time?.slice(0, 5)}</span>
                        <Badge variant="outline">{job.source === "work_order" ? "RO" : "Appointment"}</Badge>
                        {job.job_priority === "urgent" ? <Badge variant="destructive">Urgent</Badge> : null}
                      </div>
                      <p className="mt-1 truncate font-semibold">{job.title}</p>
                      <p className="truncate text-sm text-muted-foreground">{job.customer_name || job.guest_name || "Customer"}</p>
                    </div>
                    <Badge variant={job.assigned_technician_id ? "secondary" : "outline"}>
                      {job.technician_name || "Unassigned"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{job.duration_minutes ?? 60} min</span>
                    {job.location_address ? <span className="truncate">{job.location_address}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="h-full p-0">
            {showNewJob ? (
              <InlineServiceWriter onBack={() => setShowNewJob(false)} onJobCreated={() => { setShowNewJob(false); void load(); }} />
            ) : selectedJob ? (
              <QuickDispatchPanel job={selectedJob} onBack={() => setSelectedJob(null)} onAssigned={() => { setSelectedJob(null); void load(); }} />
            ) : (
              <div className="p-4">
                <h2 className="font-semibold">Technicians</h2>
                <p className="mb-3 text-xs text-muted-foreground">Active Service Writer workspace members.</p>
                <div className="space-y-2">
                  {techs.length === 0 ? <p className="text-sm text-muted-foreground">No active technicians configured.</p> : null}
                  {techs.map((tech) => (
                    <div key={tech.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{tech.name}</p>
                        <p className="text-xs text-muted-foreground">{tech.jobs_today} job{tech.jobs_today === 1 ? "" : "s"} assigned</p>
                      </div>
                      <Badge variant="outline">Available</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  if (embedded) return content;
  return <AppLayout title="Dispatch">{content}</AppLayout>;
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
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
