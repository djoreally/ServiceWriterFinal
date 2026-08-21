import { fetchOperationalJobsByDate, type OperationalJobRow } from "./operational-jobs.query";

export interface FleetStatusExportRow {
  job_id: string;
  scheduled_date: string;
  scheduled_time: string;
  canonical_state: string;
  assigned_technician_id: string | null;
  assigned_technician_name: string | null;
  customer_name: string | null;
  location_address: string | null;
  last_event_at: string | null;
  source_freshness_ms: number | null;
}

/**
 * Fleet-facing status export source.
 * Must read canonical state from dispatch_operational_jobs_v1.
 */
export async function fetchFleetStatusExportRows(userId: string, dateStr: string): Promise<FleetStatusExportRow[]> {
  const res = await fetchOperationalJobsByDate(userId, dateStr);
  const rows = (res.data ?? []) as OperationalJobRow[];
  return rows.map((r) => ({
    job_id: r.job_id,
    scheduled_date: r.scheduled_date,
    scheduled_time: r.scheduled_time,
    canonical_state: r.canonical_state,
    assigned_technician_id: r.assigned_technician_id,
    assigned_technician_name: r.assigned_technician_name,
    customer_name: r.customer_name,
    location_address: r.location_address,
    last_event_at: r.last_event_at,
    source_freshness_ms: r.source_freshness_ms,
  }));
}
