/**
 * Technician OS data-quality alerts (Phase 4).
 *
 * Field problems are almost always data problems: an unlinked technician record,
 * a job with no routable location, a Fleet job missing a site, or a job with no
 * customer contact. This module turns those into explicit, actionable alerts
 * instead of silent empty screens.
 */

export interface TechDataQualityJob {
  id: string;
  is_fleet?: boolean;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  scheduled_time?: string | null;
  customers?: { name?: string | null; phone?: string | null } | null;
}

export interface TechDataQualityAlert {
  code:
    | "technician_unlinked"
    | "jobs_without_location"
    | "fleet_jobs_without_site"
    | "jobs_without_contact"
    | "jobs_without_time"
    | "stale_data";
  severity: "warning" | "critical";
  title: string;
  detail: string;
  count: number;
  jobIds: string[];
}

const STALE_MINUTES = 15;

export function buildTechDataQualityAlerts(input: {
  accessState?: string | null;
  jobs: TechDataQualityJob[];
  dataFreshAt?: string | null;
  now?: Date;
}): TechDataQualityAlert[] {
  const alerts: TechDataQualityAlert[] = [];
  const jobs = input.jobs ?? [];
  const now = input.now ?? new Date();

  if (input.accessState && !["linked", "admin_preview"].includes(input.accessState)) {
    alerts.push({
      code: "technician_unlinked",
      severity: "critical",
      title: "Technician record not linked",
      detail: `Access state is "${input.accessState}". Dispatch must link this login to a technician before jobs appear.`,
      count: 1,
      jobIds: [],
    });
  }

  const hasCoords = (job: TechDataQualityJob) => job.location_lat != null && job.location_lng != null;

  const noLocation = jobs.filter((job) => !hasCoords(job) && !job.location_address);
  if (noLocation.length > 0) {
    alerts.push({
      code: "jobs_without_location",
      severity: "critical",
      title: "Jobs without a location",
      detail: "These jobs cannot be routed or ETA'd until dispatch adds an address.",
      count: noLocation.length,
      jobIds: noLocation.map((job) => job.id),
    });
  }

  const fleetNoSite = jobs.filter((job) => job.is_fleet && !hasCoords(job) && !job.location_address);
  if (fleetNoSite.length > 0) {
    alerts.push({
      code: "fleet_jobs_without_site",
      severity: "warning",
      title: "Fleet jobs missing a site",
      detail: "Fleet work orders need a fleet location before navigation works.",
      count: fleetNoSite.length,
      jobIds: fleetNoSite.map((job) => job.id),
    });
  }

  const noContact = jobs.filter((job) => !job.is_fleet && !job.customers?.phone);
  if (noContact.length > 0) {
    alerts.push({
      code: "jobs_without_contact",
      severity: "warning",
      title: "Jobs without a customer phone",
      detail: "Arrival and delay updates cannot reach the customer for these jobs.",
      count: noContact.length,
      jobIds: noContact.map((job) => job.id),
    });
  }

  const noTime = jobs.filter((job) => !job.scheduled_time);
  if (noTime.length > 0) {
    alerts.push({
      code: "jobs_without_time",
      severity: "warning",
      title: "Jobs without a scheduled time",
      detail: "Unscheduled jobs sort last and are excluded from the route order.",
      count: noTime.length,
      jobIds: noTime.map((job) => job.id),
    });
  }

  if (input.dataFreshAt) {
    const freshAt = new Date(input.dataFreshAt).getTime();
    if (Number.isFinite(freshAt)) {
      const ageMinutes = (now.getTime() - freshAt) / 60_000;
      if (ageMinutes > STALE_MINUTES) {
        alerts.push({
          code: "stale_data",
          severity: "warning",
          title: "Mission board is stale",
          detail: `Last synced ${Math.round(ageMinutes)} minutes ago. Pull to refresh when you have signal.`,
          count: 1,
          jobIds: [],
        });
      }
    }
  }

  return alerts;
}
