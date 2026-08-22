/**
 * TechJobs — Job list with filters for technicians
 * 
 * Admin (master tech) sees all retail appointments.
 * Regular tech sees only assigned retail appointments. Fleet work orders live
 * exclusively in the Fleet scheduler tab.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronDown, ChevronRight, Clock, MapPin, Car, Wrench, AlertTriangle,
  CheckCircle2, Play, Navigation as NavIcon,
} from "lucide-react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { formatTimeLabel, formatDateLabel } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { fetchTechJobsByFilter } from "@/application/queries/tech-app.query";
import { collapseTechFleetJobs, techFleetJobLabel } from "@/lib/tech-job-groups";
import { useTechContext } from "./TechAppLayout";

interface TechJob {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration_minutes: number;
  dispatch_status: string;
  status: string;
  job_priority: string;
  location_address: string | null;
  payment_status: string | null;
  customers: { name: string; phone: string | null } | null;
  vehicles: { year: number; make: string; model: string } | null;
  service_catalog: { name: string } | null;
  is_fleet?: boolean;
  fleet_job_id?: string | null;
  fleet_job_number?: string | null;
  fleet_vehicle_count?: number | null;
  fleet_children?: TechJob[];
}

type FilterType = "today" | "upcoming" | "in_progress" | "completed" | "issues";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Play }> = {
  assigned: { label: "Assigned", variant: "secondary", icon: Clock },
  en_route: { label: "En Route", variant: "default", icon: NavIcon },
  arrived: { label: "Arrived", variant: "default", icon: MapPin },
  in_progress: { label: "In Progress", variant: "default", icon: Play },
  completed: { label: "Completed", variant: "outline", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive", icon: AlertTriangle },
};


const getEffectiveStatus = (job: Pick<TechJob, "status" | "dispatch_status">) =>
  job.status === "completed" ? "completed" : job.dispatch_status;

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "border-l-4 border-l-destructive bg-destructive/5",
  high: "border-l-4 border-l-orange-500 bg-orange-500/5",
  normal: "",
  low: "",
};

export default function TechJobs() {
  const navigate = useNavigate();
  const { identity, loading: identityLoading } = useTechContext();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<TechJob[]>([]);
  const [filter, setFilter] = useState<FilterType>("today");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (id: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const fetchData = useCallback(async () => {
    if (!identity) return;

    const data = await fetchTechJobsByFilter(identity, filter);
    setJobs((data ?? []) as unknown as TechJob[]);
    setLoading(false);
  }, [filter, identity]);

  useEffect(() => {
    if (identity) {
      setLoading(true);
      fetchData();
    }
  }, [fetchData, identity]);

  const formatJobDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return "Today";
    if (isTomorrow(date)) return "Tomorrow";
    return format(date, "EEE, MMM d");
  };

  // Fleet work orders sharing a fleet_job_id collapse into one stop per job.
  const stops = collapseTechFleetJobs(jobs);

  const groupedJobs = stops.reduce((acc, job) => {
    const key = job.scheduled_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
    return acc;
  }, {} as Record<string, typeof stops>);

  return (
    <div className="flex flex-col h-full">
      {/* Header with Tabs */}
      <div className="sticky top-0 bg-background z-10 p-4 pb-2 border-b">
        <h1 className="text-xl font-bold mb-3">Jobs</h1>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
          <TabsList className="w-full grid grid-cols-5 h-auto">
            <TabsTrigger value="today" className="text-xs py-2">Today</TabsTrigger>
            <TabsTrigger value="upcoming" className="text-xs py-2">Upcoming</TabsTrigger>
            <TabsTrigger value="in_progress" className="text-xs py-2">Active</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs py-2">Done</TabsTrigger>
            <TabsTrigger value="issues" className="text-xs py-2">Issues</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Job List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))
        ) : jobs.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Wrench className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>No jobs found</p>
          </div>
        ) : (
          Object.entries(groupedJobs).map(([date, dateJobs]) => (
            <div key={date} className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground sticky top-0 bg-background py-1">
                {formatJobDate(date)}
              </h2>
              {dateJobs.map((job) => {
                const effectiveStatus = getEffectiveStatus(job);
                const status = STATUS_BADGE[effectiveStatus] || STATUS_BADGE.assigned;
                const children = job.fleet_children ?? [];
                const isGroup = Boolean(job.fleet_job_id) && children.length > 0;
                const groupKey = job.fleet_job_id ?? job.id;
                const expanded = expandedGroups.has(groupKey);
                const fleetLabel = isGroup ? techFleetJobLabel(job) : null;
                return (
                  <div key={groupKey} className="space-y-2">
                  <Card
                    className={cn(
                      "cursor-pointer hover:bg-accent/50 transition-colors",
                      PRIORITY_COLORS[job.job_priority]
                    )}
                    onClick={() => (isGroup ? toggleGroup(groupKey) : navigate(`/tech-app/jobs/${job.id}`))}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Time and Status */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">
                              {formatTimeLabel(job.scheduled_time, "h:mm a")}
                            </span>
                            <Badge variant={status.variant} className="text-[10px] h-5">
                              <status.icon className="h-3 w-3 mr-1" />
                              {status.label}
                            </Badge>
                            {fleetLabel && (
                              <Badge variant="secondary" className="text-[10px] h-5">{fleetLabel}</Badge>
                            )}
                            {job.job_priority === "urgent" && (
                              <Badge variant="destructive" className="text-[10px] h-5">Urgent</Badge>
                            )}
                            {job.payment_status === "paid" && (
                              <Badge variant="outline" className="text-[10px] h-5 bg-gray-500/10 text-gray-700">
                                Paid
                              </Badge>
                            )}
                          </div>

                          {/* Customer */}
                          <h3 className="font-medium truncate">
                            {job.customers?.name || "Customer"}
                          </h3>

                          {/* Vehicle */}
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <Car className="h-3 w-3" />
                            <span className="truncate">
                              {isGroup
                                ? `${children.length} work order${children.length === 1 ? "" : "s"}`
                                : job.vehicles
                                  ? `${job.vehicles.year} ${job.vehicles.make} ${job.vehicles.model}`
                                  : "Vehicle TBD"}
                            </span>
                          </div>

                          {/* Service */}
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <Wrench className="h-3 w-3" />
                            <span className="truncate">{job.service_catalog?.name || "Service"}</span>
                          </div>

                          {/* Location */}
                          {job.location_address && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{job.location_address}</span>
                            </div>
                          )}
                        </div>

                        {isGroup && expanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  {isGroup && expanded && (
                    <div className="ml-4 space-y-2 border-l pl-3">
                      {children.map((child, childIndex) => (
                        <Card
                          key={child.id}
                          className="cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => navigate(`/tech-app/jobs/${child.id}`)}
                        >
                          <CardContent className="flex items-center justify-between gap-2 p-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {child.vehicles
                                  ? `${child.vehicles.year} ${child.vehicles.make} ${child.vehicles.model}`
                                  : `Vehicle ${childIndex + 1}`}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {child.service_catalog?.name || "Service"}
                              </p>
                            </div>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {getEffectiveStatus(child).replace(/_/g, " ")}
                            </Badge>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
