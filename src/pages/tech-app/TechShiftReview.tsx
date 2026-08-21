/**
 * TechShiftReview — Phase 3 end-of-job / end-of-shift review.
 *
 * Before clocking out the technician reviews time on shift, jobs completed,
 * unresolved blockers, and jobs still requiring evidence, so nothing is handed
 * back to dispatch silently.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, Clock, Loader2, Power, ShieldAlert, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fetchTechnicianSession, type TechSessionJob } from "@/application/queries/tech-app.query";
import { buildTechMissionBoard } from "@/lib/tech-mission-board";
import { useTechShiftManagement } from "@/hooks/useTechShiftManagement";
import { trackTechShiftTransition, trackTechSyncFailure } from "@/lib/tech-telemetry";
import { useTechContext } from "./TechAppLayout";

const ACCENT = "#1439cc";
const MUTED = "#5c5f68";

export default function TechShiftReview() {
  const navigate = useNavigate();
  const { identity } = useTechContext();
  const { clockOut } = useTechShiftManagement(identity?.techId);
  const [jobs, setJobs] = useState<TechSessionJob[]>([]);
  const [shiftStart, setShiftStart] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);

  const load = useCallback(async () => {
    try {
      const session = await fetchTechnicianSession();
      setJobs(session.jobs ?? []);
      setShiftStart(session.shift?.clock_in ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load shift review";
      trackTechSyncFailure({ scope: "session", error: message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = format(new Date(), "yyyy-MM-dd");
  const board = useMemo(
    () =>
      buildTechMissionBoard(
        jobs.map((job) => ({
          id: job.id,
          scheduled_date: job.scheduled_date,
          scheduled_time: job.scheduled_time || "",
          dispatch_status: job.dispatch_status || job.status,
          status: job.status,
          job_priority: job.job_priority || "normal",
          location_address: job.location_address,
          title: job.title,
          is_fleet: job.is_fleet,
        })) as never,
        today,
      ),
    [jobs, today],
  );

  const hoursOnShift = shiftStart
    ? Math.round(((Date.now() - new Date(shiftStart).getTime()) / 3_600_000) * 10) / 10
    : 0;

  const handleEndShift = async () => {
    setEnding(true);
    try {
      await clockOut();
      trackTechShiftTransition({ action: "clock_out", technician_id: identity?.techId, succeeded: true });
      toast.success("Shift ended");
      navigate("/tech-app");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not end the shift";
      trackTechShiftTransition({ action: "clock_out", technician_id: identity?.techId, succeeded: false, error: message });
      toast.error(message);
    } finally {
      setEnding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: MUTED }} />
      </div>
    );
  }

  const rows = [
    { icon: Clock, label: "Hours on shift", value: `${hoursOnShift}` },
    { icon: CheckCircle2, label: "Jobs completed", value: `${board.counts.completed}/${board.counts.today}` },
    { icon: ShieldAlert, label: "Unresolved blockers", value: `${board.blockers.length}`, critical: board.blockers.length > 0 },
    { icon: Camera, label: "Jobs awaiting evidence", value: `${board.evidenceRequired.length}`, critical: board.evidenceRequired.length > 0 },
  ];

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tech-app")} aria-label="Back to dashboard">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-extrabold">End of shift review</h1>
          <p className="text-sm" style={{ color: MUTED }}>
            {format(new Date(), "EEEE, MMMM d")}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
              <span className="flex items-center gap-3 text-sm font-semibold">
                <Icon className="h-5 w-5" style={{ color: row.critical ? "#dc2626" : ACCENT }} />
                {row.label}
              </span>
              <span className="text-lg font-extrabold" style={{ color: row.critical ? "#dc2626" : undefined }}>
                {row.value}
              </span>
            </div>
          );
        })}
      </div>

      {board.blockers.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-mono text-xs font-extrabold uppercase tracking-[0.16em]" style={{ color: MUTED }}>
            Needs handoff
          </h2>
          {board.blockers.map((job) => (
            <button
              key={job.id}
              className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
              onClick={() => navigate(`/tech-app/jobs/${job.id}`)}
            >
              <span>
                <span className="block text-sm font-bold">{job.customers?.name || job.title || "Job"}</span>
                <span className="text-xs" style={{ color: MUTED }}>
                  {(job.dispatch_status || job.status || "").replace(/_/g, " ")}
                </span>
              </span>
              <span className="text-xs font-semibold underline" style={{ color: ACCENT }}>
                Resolve
              </span>
            </button>
          ))}
        </div>
      )}

      <Button
        className="h-14 w-full rounded-xl text-base font-extrabold uppercase tracking-[0.08em] text-white"
        style={{ backgroundColor: ACCENT }}
        onClick={handleEndShift}
        disabled={ending}
      >
        {ending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Power className="mr-2 h-5 w-5" />}
        {ending ? "Ending shift…" : "End shift"}
      </Button>
    </div>
  );
}
