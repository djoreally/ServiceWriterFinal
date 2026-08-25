import { useCallback, useState } from "react";
import { assignDispatchJobRpc } from "@/application/queries/quick-dispatch.query";
import { fetchActiveTechnicians } from "@/application/queries/command-center.query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, CheckCircle2, Loader2, MapPin, UserRound, Wrench } from "lucide-react";
import { toast } from "sonner";

interface SelectedJob {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  guest_name: string | null;
  customer_name: string | null;
  location_address: string | null;
  job_priority: string | null;
  source?: "appointment" | "work_order" | string | null;
}

interface TechnicianOption {
  id: string;
  name: string;
  status: string;
  avatar_url: string | null;
}

interface Props {
  job: SelectedJob;
  onBack: () => void;
  onAssigned: () => void;
}

export const QuickDispatchPanel = ({ job, onBack, onAssigned }: Props) => {
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  const loadTechnicians = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchActiveTechnicians("");
      if (error) throw error;
      setTechnicians((data ?? []) as TechnicianOption[]);
      setLoaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load technicians");
    } finally {
      setLoading(false);
    }
  }, []);

  const assign = useCallback(async (technician: TechnicianOption) => {
    setAssigning(technician.id);
    try {
      const jobSource = job.source === "work_order" ? "work_order" : "appointment";
      const { error } = await assignDispatchJobRpc({
        jobSource,
        jobId: job.id,
        technicianId: technician.id,
        notes: "Assigned from Service Writer Command Center",
      });
      if (error) throw error;
      toast.success(`Assigned ${technician.name} to ${job.title}`);
      onAssigned();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Assignment failed");
    } finally {
      setAssigning(null);
    }
  }, [job, onAssigned]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{job.title}</h3>
            <p className="text-[10px] text-muted-foreground">
              {job.customer_name || job.guest_name || "Customer"} · {job.scheduled_time?.slice(0, 5)} · {job.duration_minutes} min
            </p>
          </div>
          {job.source === "work_order" && <Badge variant="outline">RO</Badge>}
          {job.job_priority === "urgent" && <Badge variant="destructive">Urgent</Badge>}
        </div>
        {job.location_address && (
          <p className="ml-9 flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="h-3 w-3" /> {job.location_address}
          </p>
        )}
      </div>

      <div className="border-b bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Dispatch is now based on active Service Writer workspace members. Live GPS/road-ETA ranking will be added only after technician location tracking is rebuilt on Final.
      </div>

      <div className="flex-1 overflow-hidden">
        {!loaded ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <Wrench className="h-8 w-8 text-primary/60" />
            <p className="text-sm text-muted-foreground">Choose an active technician for this job.</p>
            <Button onClick={loadTechnicians} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserRound className="mr-2 h-4 w-4" />}
              Load Technicians
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-2 p-3">
              {technicians.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No active technicians are configured for this workspace.</p>
              ) : technicians.map((technician) => (
                <div key={technician.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{technician.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{technician.status || "available"}</p>
                  </div>
                  <Button size="sm" disabled={assigning !== null} onClick={() => assign(technician)}>
                    {assigning === technician.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                    Assign
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
