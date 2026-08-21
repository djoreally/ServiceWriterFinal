import { useEffect, useState } from "react";
import {
  fetchFleetOpsEvents,
  subscribeFleetOpsEvents,
  type FleetOpsEvent,
} from "@/application/queries/fleet.query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Activity,
  Car,
  ClipboardList,
  DollarSign,
  Edit3,
  PlusCircle,
  Send,
  Trash2,
  type LucideIcon,
} from "lucide-react";

type OpsEvent = FleetOpsEvent;

const CATEGORY: Record<
  OpsEvent["event_category"],
  { icon: LucideIcon; tone: string; label: string }
> = {
  create: { icon: PlusCircle, tone: "text-emerald-600 bg-emerald-500/10", label: "Created" },
  dispatch: { icon: Send, tone: "text-primary bg-primary/10", label: "Dispatch" },
  status: { icon: Activity, tone: "text-amber-600 bg-amber-500/10", label: "Status" },
  assignment: { icon: ClipboardList, tone: "text-indigo-600 bg-indigo-500/10", label: "Assignment" },
  finance: { icon: DollarSign, tone: "text-purple-600 bg-purple-500/10", label: "Finance" },
  edit: { icon: Edit3, tone: "text-slate-600 bg-muted", label: "Edit" },
  delete: { icon: Trash2, tone: "text-red-600 bg-red-500/10", label: "Removed" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}


interface Props {
  fleetClientId?: string;
  vehicleId?: string;
  workOrderId?: string;
  limit?: number;
  title?: string;
  className?: string;
}

export function FleetOpsFeed({
  fleetClientId,
  vehicleId,
  workOrderId,
  limit = 50,
  title = "Operations feed",
  className,
}: Props) {
  const [events, setEvents] = useState<OpsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const rows = await fetchFleetOpsEvents({ fleetClientId, vehicleId, workOrderId, limit });
      if (!cancelled) {
        setEvents(rows);
        setLoading(false);
      }
    }
    load();

    // Realtime subscription
    const sub = subscribeFleetOpsEvents(
      `${fleetClientId ?? "all"}-${vehicleId ?? ""}-${workOrderId ?? ""}`,
      (e) => {
        if (fleetClientId && e.fleet_client_id !== fleetClientId) return;
        if (vehicleId && e.fleet_vehicle_id !== vehicleId) return;
        if (workOrderId && e.fleet_work_order_id !== workOrderId) return;
        setEvents((prev) => [e, ...prev].slice(0, limit));
      },
    );

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [fleetClientId, vehicleId, workOrderId, limit]);


  return (
    <div className={cn("rounded-xl border bg-card", className)}>
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant="outline" className="text-[10px]">
          {events.length} event{events.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <ScrollArea className="h-[420px]">
        <div className="p-2 space-y-1">
          {loading && (
            <p className="text-xs text-muted-foreground px-3 py-6 text-center">Loading…</p>
          )}
          {!loading && events.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-6 text-center">
              No activity yet. Events post automatically as work flows through the pipeline.
            </p>
          )}
          {events.map((e) => {
            const meta = CATEGORY[e.event_category] ?? CATEGORY.edit;
            const Icon = meta.icon;
            return (
              <div
                key={e.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className={cn("h-7 w-7 rounded-md flex items-center justify-center shrink-0", meta.tone)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{e.summary}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {meta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(e.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
