/**
 * TechMissionAlerts — Phase 3 mission board panel + Phase 4 data-quality alerts.
 *
 * Replaces generic vanity stats with the things that actually change what the
 * technician does next: blockers, schedule changes, approvals waiting, required
 * evidence, and data problems that will break routing or customer updates.
 */

import { AlertTriangle, CalendarClock, Camera, ShieldAlert, Package } from "lucide-react";
import type { TechMissionBoard } from "@/lib/tech-mission-board";
import type { TechDataQualityAlert } from "@/lib/tech-data-quality";

interface Props {
  accent: string;
  muted: string;
  missionBoard: TechMissionBoard;
  dataQualityAlerts: TechDataQualityAlert[];
  partsInVan: number;
  onOpenJob: (jobId: string) => void;
}

export function TechMissionAlerts({ accent, muted, missionBoard, dataQualityAlerts, partsInVan, onOpenJob }: Props) {
  const tiles = [
    {
      key: "blockers",
      label: "Blockers",
      value: missionBoard.blockers.length,
      icon: ShieldAlert,
      critical: missionBoard.blockers.length > 0,
      jobs: missionBoard.blockers,
    },
    {
      key: "schedule",
      label: "Schedule changes",
      value: missionBoard.scheduleChanges.length,
      icon: CalendarClock,
      critical: false,
      jobs: missionBoard.scheduleChanges,
    },
    {
      key: "evidence",
      label: "Evidence required",
      value: missionBoard.evidenceRequired.length,
      icon: Camera,
      critical: false,
      jobs: missionBoard.evidenceRequired,
    },
    {
      key: "parts",
      label: "Parts in van",
      value: partsInVan,
      icon: Package,
      critical: false,
      jobs: [],
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="font-mono text-xs font-extrabold uppercase tracking-[0.16em]" style={{ color: muted }}>
        Mission Board
      </h2>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.key} className="rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" style={{ color: tile.critical ? "#dc2626" : accent }} />
                <span className="font-mono text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: muted }}>
                  {tile.label}
                </span>
              </span>
              <p className="mt-1 text-2xl font-extrabold" style={{ color: tile.critical ? "#dc2626" : undefined }}>
                {tile.value}
              </p>
              {tile.jobs.length > 0 && (
                <button
                  className="mt-1 text-left text-xs font-semibold underline"
                  style={{ color: accent }}
                  onClick={() => onOpenJob(tile.jobs[0].id)}
                >
                  Open first
                </button>
              )}
            </div>
          );
        })}
      </div>

      {dataQualityAlerts.length > 0 && (
        <div className="space-y-2">
          {dataQualityAlerts.map((alert) => (
            <div
              key={alert.code}
              className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
              style={{ borderLeft: `5px solid ${alert.severity === "critical" ? "#dc2626" : "#f59e0b"}` }}
            >
              <AlertTriangle
                className="mt-0.5 h-5 w-5 flex-shrink-0"
                style={{ color: alert.severity === "critical" ? "#dc2626" : "#f59e0b" }}
              />
              <div>
                <p className="text-sm font-extrabold">
                  {alert.title}
                  {alert.count > 1 ? ` (${alert.count})` : ""}
                </p>
                <p className="text-xs" style={{ color: muted }}>
                  {alert.detail}
                </p>
                {alert.jobIds.length > 0 && (
                  <button
                    className="mt-1 text-xs font-semibold underline"
                    style={{ color: accent }}
                    onClick={() => onOpenJob(alert.jobIds[0])}
                  >
                    Open affected job
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
