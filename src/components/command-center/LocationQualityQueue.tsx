import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2, MapPin, Search, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import {
  getLocationQualityQueue,
  resolveLocation,
  saveLocationQuality,
  type LocationQualityQueueItem,
} from "@/application/commands/location-service.command";
import type { ResolvedLocation } from "@/application/location/location-service.contracts";

interface LocationQualityQueueProps {
  onResolved?: () => void;
}

const qualityVariant = (status: LocationQualityQueueItem["qualityStatus"]) => {
  if (status === "verified" || status === "overridden") return "secondary" as const;
  if (status === "missing") return "destructive" as const;
  return "outline" as const;
};

const qualityLabel = (status: LocationQualityQueueItem["qualityStatus"]) => status.replace("_", " ");

export function LocationQualityQueue({ onResolved }: LocationQualityQueueProps) {
  const [jobs, setJobs] = useState<LocationQualityQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [candidates, setCandidates] = useState<ResolvedLocation[]>([]);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getLocationQualityQueue();
      setJobs(result.jobs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load the location quality queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => refresh());
  }, [refresh]);

  const flaggedJobs = useMemo(
    () => jobs.filter((job) => job.qualityStatus !== "verified" && job.qualityStatus !== "overridden"),
    [jobs],
  );

  const expandedJob = jobs.find((job) => `${job.jobSource}:${job.jobId}` === expandedJobId) ?? null;

  const openJob = async (job: LocationQualityQueueItem) => {
    const key = `${job.jobSource}:${job.jobId}`;
    if (expandedJobId === key) {
      setExpandedJobId(null);
      setCandidates([]);
      return;
    }
    setExpandedJobId(key);
    setSearchText(job.normalizedAddress || job.locationAddress || "");
    setCandidates([]);
  };

  const searchCandidates = async () => {
    if (!searchText.trim()) {
      toast.error("Enter an address or place name to search");
      return;
    }
    setResolving(true);
    try {
      const result = await resolveLocation({
        query: searchText,
        limit: 5,
        persistenceMode: "permanent",
      });
      setCandidates(result.results);
      if (result.results.length === 0) toast.error("No routable location was found");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to resolve this address");
    } finally {
      setResolving(false);
    }
  };

  const verifyCandidate = async (candidate: ResolvedLocation) => {
    if (!expandedJob) return;
    setSaving(true);
    try {
      await saveLocationQuality({
        jobId: expandedJob.jobId,
        jobSource: expandedJob.jobSource,
        enteredAddress: expandedJob.locationAddress,
        normalizedAddress: candidate.label,
        mapboxFeatureId: candidate.featureId,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        addressType: candidate.addressType,
        qualityStatus: "verified",
        persistenceMode: "permanent",
      });
      toast.success("Location verified", { description: "Technicians can now begin navigation for this job." });
      setExpandedJobId(null);
      setCandidates([]);
      await refresh();
      onResolved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to verify the selected location");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading location checks…
      </div>
    );
  }

  if (flaggedJobs.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" /> All upcoming jobs have verified destinations.
      </div>
    );
  }

  return (
    <section className="border-b border-border px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Location checks ({flaggedJobs.length})
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
        {flaggedJobs.map((job) => {
          const key = `${job.jobSource}:${job.jobId}`;
          const isExpanded = key === expandedJobId;
          return (
            <Card key={key} className="border-muted shadow-none">
              <CardContent className="p-2">
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-2 text-left"
                  onClick={() => openJob(job)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{job.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />{job.locationAddress || "No address supplied"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant={qualityVariant(job.qualityStatus)} className="text-[9px] capitalize">
                      {qualityLabel(job.qualityStatus)}
                    </Badge>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-2 space-y-2 border-t border-border pt-2">
                    <div className="flex gap-1.5">
                      <Input
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                        className="h-8 text-xs"
                        placeholder="Search address or place"
                      />
                      <Button size="sm" className="h-8" onClick={searchCandidates} disabled={resolving || saving}>
                        {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    {candidates.map((candidate) => (
                      <button
                        key={`${candidate.featureId ?? candidate.label}:${candidate.latitude}:${candidate.longitude}`}
                        type="button"
                        className="w-full rounded-md border border-border p-2 text-left text-xs hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                        disabled={saving}
                        onClick={() => verifyCandidate(candidate)}
                      >
                        <span className="block font-medium">{candidate.label}</span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {candidate.latitude.toFixed(5)}, {candidate.longitude.toFixed(5)} · Select to verify
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
