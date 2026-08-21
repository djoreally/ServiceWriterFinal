/**
 * QuickDispatchPanel — One-click technician assignment for a selected job.
 *
 * Calls the dispatch-engine edge function to get AI-ranked candidates,
 * then renders a ranked list with one-click "Assign" buttons.
 *
 * Performance: Only fetches candidates when a job is selected (lazy).
 */

import { useState, useCallback } from "react";
import { assignDispatchJobRpc } from "@/application/queries/quick-dispatch.query";
import { getDispatchCandidates, type DispatchLocationQuality } from "@/application/commands/location-service.command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Zap, MapPin, Clock, Loader2, CheckCircle2,
  ChevronLeft, AlertTriangle, Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

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
  customer_postal_code?: string | null;
  source?: "appointment" | "fleet_work_order" | string | null;
}

interface RankedCandidate {
  rank: number;
  technician_id: string;
  name: string;
  eta_seconds: number;
  distance_meters: number | null;
  freshness_status: string;
  availability_status: string;
  score_seconds: number;
  explanation: {
    road_eta_seconds: number;
    freshness_penalty_seconds: number;
    availability_penalty_seconds: number;
  };
}

interface Props {
  job: SelectedJob;
  onBack: () => void;
  onAssigned: () => void;
}

const formatEta = (seconds: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

// ─── Component ─────────────────────────────────────────────────────────────

export const QuickDispatchPanel = ({ job, onBack, onAssigned }: Props) => {
  const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationQuality, setLocationQuality] = useState<DispatchLocationQuality | null>(null);

  // Fetch ranked candidates from the dispatch engine
  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const jobSource = job.source === "fleet_work_order" ? "fleet_work_order" : "appointment";
      const result = await getDispatchCandidates({ jobId: job.id, jobSource });
      setLocationQuality(result.locationQuality);
      const ranked = result.candidates.map((candidate, index) => ({
        rank: index + 1,
        technician_id: candidate.technicianId,
        name: candidate.technicianName,
        eta_seconds: candidate.etaSeconds ?? 0,
        distance_meters: candidate.distanceMeters,
        freshness_status: candidate.freshnessStatus,
        availability_status: candidate.availabilityStatus,
        score_seconds: candidate.scoreSeconds,
        explanation: {
          road_eta_seconds: candidate.explanation.roadEtaSeconds ?? 0,
          freshness_penalty_seconds: candidate.explanation.freshnessPenaltySeconds,
          availability_penalty_seconds: candidate.explanation.availabilityPenaltySeconds,
        },
      }));
      setCandidates(ranked);
      setFetched(true);

      if (ranked.length === 0) {
        setError("No eligible technicians with a recent authorized location were found for this job.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dispatch candidates are unavailable.";
      setError(message.includes("dispatch_candidates_require_usable_location")
        ? "This job has no usable coordinates. Verify or correct its location before using road-ETA assignment."
        : "Dispatch candidates are unavailable.");
    } finally {
      setLoading(false);
    }
  }, [job]);

  // One-click assign
  const assignTech = useCallback(
    async (techId: string, techName: string) => {
      setAssigning(techId);
      try {
        const isFleet = job.source === "fleet_work_order";
        const { error: rpcError } = await assignDispatchJobRpc({
          jobSource: isFleet ? "fleet_work_order" : "appointment",
          jobId: job.id,
          technicianId: techId,
          date: isFleet ? job.scheduled_date : null,
          start: isFleet ? job.scheduled_time : null,
          durationMinutes: job.duration_minutes || 60,
          notes: "Assigned via Command Center (road-ETA recommendation reviewed by dispatcher)",
        });

        if (rpcError) throw rpcError;

        toast.success(`Assigned ${techName} to "${job.title}"`);
        onAssigned();
      } catch (err: unknown) {
        console.error("Assign failed:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        toast.error("Assignment failed: " + message);
      } finally {
        setAssigning(null);
      }
    },
    [job, onAssigned]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate">{job.title}</h3>
            <p className="text-[10px] text-muted-foreground">
              {job.customer_name || job.guest_name || "Walk-in"} · {job.scheduled_time?.slice(0, 5)} · {job.duration_minutes}min
            </p>
          </div>
          {job.job_priority === "urgent" && (
            <Badge variant="destructive" className="text-[10px]">urgent</Badge>
          )}
        </div>

        {job.location_address && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 ml-9">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            {job.location_address}
          </p>
        )}
      </div>

      {/* Candidates */}
      <div className="flex-1 overflow-hidden">
        {!fetched && !loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Zap className="h-8 w-8 text-primary/50" />
            <p className="text-sm text-muted-foreground text-center px-6">
              Rank eligible technicians by road ETA, live-location freshness, and availability before assigning.
            </p>
            <Button onClick={fetchCandidates} className="gap-2">
              <Zap className="h-4 w-4" />
              Find road-ETA match
            </Button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Ranking technicians…</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
            <AlertTriangle className="h-8 w-8 text-amber-500/60" />
            <p className="text-sm text-muted-foreground text-center">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchCandidates}>
              Retry
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="px-3 py-2 space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1">
                {candidates.length} candidate{candidates.length !== 1 ? "s" : ""} ranked
              </p>

              {locationQuality?.requiresReview && locationQuality.advisory && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{locationQuality.advisory}</span>
                </div>
              )}

              {candidates.map((c, idx) => (
                <div
                  key={c.technician_id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    idx === 0
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:bg-accent/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {idx === 0 && <Trophy className="h-4 w-4 text-primary shrink-0" />}
                      <div>
                        <p className="text-sm font-medium">
                          #{c.rank} {c.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground capitalize">
                          {c.availability_status.replace("_", " ")} · location {c.freshness_status.replace("_", " ")}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={idx === 0 ? "default" : "outline"}
                      className="gap-1 text-xs h-7 shrink-0"
                      disabled={assigning !== null}
                      onClick={() => assignTech(c.technician_id, c.name)}
                    >
                      {assigning === c.technician_id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Assign
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    <p><span className="font-medium text-foreground">Road ETA:</span> {formatEta(c.eta_seconds)}</p>
                    <p><span className="font-medium text-foreground">Freshness:</span> +{formatEta(c.explanation.freshness_penalty_seconds)}</p>
                    <p><span className="font-medium text-foreground">Availability:</span> +{formatEta(c.explanation.availability_penalty_seconds)}</p>
                    {c.distance_meters != null && <p><span className="font-medium text-foreground">Distance:</span> {(c.distance_meters / 1609.34).toFixed(1)} mi</p>}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
