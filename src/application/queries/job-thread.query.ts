import { apiClient } from "@/lib/api-client";
import type { JobCommunicationRole } from "@packages/shared/lifecycle";
import { mapOperationalSourceToJobSource } from "@/lib/job-thread-source";

export type JobSource = "appointment" | "fleet_work_order";

export interface JobThreadTimelineItem {
  id: string;
  thread_id: string;
  item_type: "human_message" | "system_event" | "exception";
  created_at: string;
  created_by: string | null;
  payload: Record<string, unknown>;
}

export interface TechnicianMessageJob {
  id: string;
  title: string;
  source: JobSource;
  scheduledDate: string;
  scheduledTime: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
}

interface JobThreadMessageRow {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_role: string | null;
  content: string;
  attachments: unknown;
  channel: string | null;
  recipient: string | null;
  created_at: string;
  job_message_deliveries: unknown;
}

interface JobThreadEventRow {
  id: string;
  thread_id: string;
  event_type: string;
  metadata: unknown;
  created_at: string;
  created_by: string | null;
}

interface JobThreadExceptionRow {
  id: string;
  thread_id: string;
  exception_type: string;
  note: string | null;
  attachments: unknown;
  created_at: string;
  created_by: string | null;
}

interface TimelineBundle {
  thread_id: string;
  messages: JobThreadMessageRow[];
  events: JobThreadEventRow[];
  exceptions: JobThreadExceptionRow[];
}

export async function ensureJobThread(jobId: string, jobSource: JobSource) {
  const response = await apiClient.post<{ data: { thread_id: string } }>("/v1/job-threads/ensure", {
    job_id: jobId,
    job_source: jobSource,
  });
  return response.data.thread_id as string;
}

export async function fetchJobThreadTimeline(jobId: string, jobSource: JobSource): Promise<JobThreadTimelineItem[]> {
  const response = await apiClient.get<{ data: TimelineBundle }>("/v1/job-threads/timeline", {
    query: { job_id: jobId, job_source: jobSource },
  });
  const { messages: messagesRes, events: eventsRes, exceptions: exceptionsRes } = response.data;

  const messages = ((messagesRes ?? []) as JobThreadMessageRow[]).map((m) => ({
    id: m.id,
    thread_id: m.thread_id,
    item_type: "human_message" as const,
    created_at: m.created_at,
    created_by: m.sender_id,
    payload: {
      sender_role: m.sender_role,
      content: m.content,
      attachments: m.attachments ?? [],
      channel: m.channel ?? "dispatch",
      recipient: m.recipient,
      delivery: Array.isArray(m.job_message_deliveries) ? m.job_message_deliveries[0] ?? null : m.job_message_deliveries ?? null,
    },
  }));

  const events = ((eventsRes ?? []) as JobThreadEventRow[]).map((e) => ({
    id: e.id,
    thread_id: e.thread_id,
    item_type: "system_event" as const,
    created_at: e.created_at,
    created_by: e.created_by,
    payload: {
      event_type: e.event_type,
      metadata: e.metadata ?? {},
    },
  }));

  const exceptions = ((exceptionsRes ?? []) as JobThreadExceptionRow[]).map((x) => ({
    id: x.id,
    thread_id: x.thread_id,
    item_type: "exception" as const,
    created_at: x.created_at,
    created_by: x.created_by,
    payload: {
      exception_type: x.exception_type,
      note: x.note,
      attachments: x.attachments ?? [],
    },
  }));

  return [...messages, ...events, ...exceptions].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function markJobThreadRead(threadId: string) {
  await apiClient.post(`/v1/job-threads/${encodeURIComponent(threadId)}/read`, {});
}

const SUBSCRIBE_POLL_MS = 15000;

/**
 * Subscribe to timeline changes.
 *
 * There is no realtime primitive on the sanctioned API client, so this polls
 * the timeline bundle and invokes the callback when a new item appears. The
 * exported signature (returns an unsubscribe function) is unchanged.
 */
export function subscribeJobThreadTimeline(threadId: string, onChange: () => void) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let lastFingerprint: string | undefined;

  const fingerprint = (bundle: TimelineBundle): string => {
    const ids = [
      ...(bundle.messages ?? []).map((m) => m.id),
      ...(bundle.events ?? []).map((e) => e.id),
      ...(bundle.exceptions ?? []).map((x) => x.id),
    ].sort().join(",");
    return `${ids}`;
  };

  const check = async () => {
    if (stopped) return;
    try {
      const items = await fetchJobThreadTimelineById(threadId);
      const current = fingerprint(items);
      if (lastFingerprint === undefined) {
        lastFingerprint = current;
        return;
      }
      if (current !== lastFingerprint) {
        lastFingerprint = current;
        onChange();
      }
    } catch {
      // Transient failure — retry on the next tick.
    }
  };

  void check();
  timer = setInterval(() => { void check(); }, SUBSCRIBE_POLL_MS);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}

/** Timeline bundle fetch by thread id, for the polling subscriber. */
async function fetchJobThreadTimelineById(threadId: string): Promise<TimelineBundle> {
  const response = await apiClient.get<{ data: TimelineBundle }>("/v1/job-threads/timeline-by-id", {
    query: { thread_id: threadId },
  });
  return response.data;
}

export async function openCommunicationThreadForJob(params: {
  jobId: string;
  jobSource: JobSource;
  roles?: JobCommunicationRole[];
}) {
  const threadId = await ensureJobThread(params.jobId, params.jobSource);
  return {
    threadId,
    roles: params.roles ?? ["dispatch", "technician", "management"],
  };
}

export async function openCommunicationThreadsForJobs(
  jobs: Array<{ job_id: string; source?: string | null }>,
) {
  const unique = new Map<string, JobSource>();
  for (const job of jobs) {
    const source = mapOperationalSourceToJobSource(job.source);
    if (!source || !job.job_id) continue;
    unique.set(`${job.job_id}:${source}`, source);
  }

  await Promise.all(
    Array.from(unique.entries()).map(async ([key, source]) => {
      const [jobId] = key.split(":");
      await openCommunicationThreadForJob({ jobId, jobSource: source });
    }),
  );
}
