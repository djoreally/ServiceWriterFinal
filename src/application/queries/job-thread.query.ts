import { supabase } from "@/integrations/supabase/client";
import type { JobCommunicationRole } from "@packages/shared/lifecycle";
import { mapOperationalSourceToJobSource } from "@/lib/job-thread-source";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
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

export async function ensureJobThread(jobId: string, jobSource: JobSource) {
  const { data: auth } = await getCurrentAuthUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const client = supabase as any;
  const { data, error } = await client.rpc("ensure_job_thread", {
    p_job_id: jobId,
    p_job_source: jobSource,
    p_created_by: userId,
  });

  if (error) throw error;
  return data as string;
}

export async function fetchJobThreadTimeline(jobId: string, jobSource: JobSource): Promise<JobThreadTimelineItem[]> {
  const threadId = await ensureJobThread(jobId, jobSource);
  const client = supabase as any;

  const [messagesRes, eventsRes, exceptionsRes] = await Promise.all([
    client
      .from("job_thread_messages")
      .select("id, thread_id, sender_id, sender_role, content, attachments, channel, recipient, created_at, job_message_deliveries(status, last_error, delivered_at)")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    client
      .from("job_thread_events")
      .select("id, thread_id, event_type, metadata, created_at, created_by")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    client
      .from("job_thread_exceptions")
      .select("id, thread_id, exception_type, note, attachments, created_at, created_by")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (exceptionsRes.error) throw exceptionsRes.error;

  const messages = ((messagesRes.data ?? []) as JobThreadMessageRow[]).map((m) => ({
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

  const events = ((eventsRes.data ?? []) as JobThreadEventRow[]).map((e) => ({
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

  const exceptions = ((exceptionsRes.data ?? []) as JobThreadExceptionRow[]).map((x) => ({
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
  const { error } = await (supabase as any).rpc("mark_job_thread_read_v1", { p_thread_id: threadId });
  if (error) throw error;
}

export function subscribeJobThreadTimeline(threadId: string, onChange: () => void) {
  const channel = supabase.channel(`tech-job-thread-${threadId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_thread_messages", filter: `thread_id=eq.${threadId}` }, onChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_thread_events", filter: `thread_id=eq.${threadId}` }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
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
