/**
 * TechFleet — Fleet scheduler assignments for the current technician.
 *
 * The technician dashboard covers retail appointments; this screen surfaces
 * every fleet work order dispatched to the tech through the Fleet scheduler.
 * Work orders sharing a `fleet_job_id` collapse into ONE expandable stop so a
 * 25-vehicle fleet job reads as a single destination instead of 25 cards.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { Building2, ChevronDown, ChevronRight, Clock, Layers, MapPin, RefreshCw, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { fetchTechFleetAssignments, type TechFleetAssignment } from "@/application/queries/tech-app.query";
import { collapseTechFleetJobs, techFleetJobLabel, type TechJobStop } from "@/lib/tech-job-groups";
import { useTechContext } from "./TechAppLayout";

type FleetFilter = "today" | "upcoming" | "open" | "completed";

const OPEN_STATUSES = new Set(["draft", "scheduled", "assigned", "accepted", "en_route", "arrived", "in_progress", "waiting_parts"]);

function formatWhen(date: string | null, time: string | null): string {
  if (!date) return "Unscheduled";
  const parsed = parseISO(date);
  const label = isToday(parsed) ? "Today" : isTomorrow(parsed) ? "Tomorrow" : format(parsed, "EEE MMM d");
  return time ? `${label} · ${time.slice(0, 5)}` : label;
}

function matchesFilter(job: TechFleetAssignment, filter: FleetFilter, today: string): boolean {
  const status = (job.status || "").toLowerCase();
  if (filter === "today") return job.scheduled_date === today;
  if (filter === "upcoming") return Boolean(job.scheduled_date && job.scheduled_date > today);
  if (filter === "completed") return status === "completed" || status === "invoiced" || status === "closed";
  return OPEN_STATUSES.has(status);
}

export default function TechFleet() {
  const navigate = useNavigate();
  const { identity, loading: identityLoading } = useTechContext();
  const [jobs, setJobs] = useState<TechFleetAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FleetFilter>("today");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = useCallback((jobId: string) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);


  const load = useCallback(async () => {
    if (!identity) return;
    setLoading(true);
    setError(null);
    try {
      setJobs(await fetchTechFleetAssignments(identity));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Fleet assignments could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    if (identity) void Promise.resolve().then(() => load());
  }, [identity, load]);

  const today = format(new Date(), "yyyy-MM-dd");
  const visible = useMemo<Array<TechJobStop<TechFleetAssignment & { is_fleet: true }>>>(() => {
    const filtered = jobs
      .filter((job) => matchesFilter(job, filter, today))
      .map((job) => ({ ...job, is_fleet: true as const }));
    return collapseTechFleetJobs(filtered);
  }, [jobs, filter, today]);


  if (identityLoading) {
    return (
      <div className="space-y-3 p-5">
        {[0, 1, 2].map((key) => <Skeleton key={key} className="h-24 w-full" />)}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-[-0.02em]">
            <Truck className="h-6 w-6" /> Fleet Schedule
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Work orders assigned to you through the Fleet scheduler.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh fleet assignments">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </header>

      <Tabs value={filter} onValueChange={(value) => setFilter(value as FleetFilter)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="completed">Done</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((key) => <Skeleton key={key} className="h-24 w-full" />)}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No fleet work orders in this view.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((job) => {
            const children = job.fleet_children ?? [];
            const isGroup = Boolean(job.fleet_job_id) && children.length > 1;
            const groupKey = job.fleet_job_id ?? job.id;
            const expanded = expandedGroups.has(groupKey);
            const fleetLabel = isGroup ? techFleetJobLabel(job) : null;
            const open = () => navigate(`/tech-app/jobs/${job.id}`);

            return (
              <Card key={groupKey} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => (isGroup ? toggleGroup(groupKey) : open())}
                    onKeyDown={(event) => { if (event.key === "Enter") { if (isGroup) toggleGroup(groupKey); else open(); } }}
                    className="flex cursor-pointer items-center gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="uppercase">{(job.status || "scheduled").replace(/_/g, " ")}</Badge>
                        {job.priority && job.priority.toLowerCase() !== "normal" && (
                          <Badge variant="destructive" className="uppercase">{job.priority}</Badge>
                        )}
                        {isGroup ? (
                          <Badge variant="outline" className="gap-1 font-mono text-xs">
                            <Layers className="h-3 w-3" /> {fleetLabel}
                          </Badge>
                        ) : job.order_number ? (
                          <span className="font-mono text-xs text-muted-foreground">#{job.order_number}</span>
                        ) : null}
                      </div>
                      <p className="truncate font-bold">{job.service_type || job.description || "Fleet service"}</p>
                      <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" /> {job.client_name || "Fleet client"}
                      </p>
                      {!isGroup && job.vehicle_label && (
                        <p className="truncate text-sm text-muted-foreground">{job.vehicle_label}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {job.scheduled_date && !job.scheduled_time ? `${formatWhen(job.scheduled_date, null)} · Time not set` : formatWhen(job.scheduled_date, job.scheduled_time)}</span>
                        {job.location_label && (
                          <span className="flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5" /> <span className="truncate">{job.location_label}</span></span>
                        )}
                      </div>
                    </div>
                    {isGroup
                      ? (expanded
                        ? <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />)
                      : <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
                  </div>

                  {isGroup && expanded && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {children.map((child) => (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => navigate(`/tech-app/jobs/${child.id}`)}
                          className="flex w-full items-center gap-2 rounded-lg bg-muted/50 p-2 text-left"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{child.vehicle_label || "Vehicle"}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              #{child.order_number} · {(child.status || "scheduled").replace(/_/g, " ")}
                            </span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

      )}
    </div>
  );
}
