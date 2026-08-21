import { supabase } from "@/integrations/supabase/client";
import { ensureJobThread, type JobSource } from "@/application/queries/job-thread.query";
import type { JobCommunicationRole } from "@packages/shared/lifecycle";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function sendJobThreadHumanMessage(params: {
  jobId: string;
  jobSource: JobSource;
  content: string;
  attachments?: string[];
  senderRole: JobCommunicationRole;
  channel?: "dispatch" | "customer_sms" | "customer_email";
  recipient?: string;
  clientMessageId?: string;
}) {
  const client = supabase as any;
  const { data, error } = await client.rpc("send_job_thread_message_v2", {
    p_job_id: params.jobId,
    p_job_source: params.jobSource,
    p_content: params.content,
    p_channel: params.channel ?? "dispatch",
    p_recipient: params.recipient ?? null,
    p_attachments: params.attachments ?? [],
    p_client_message_id: params.clientMessageId ?? crypto.randomUUID(),
  });
  return { data, error: error?.message ?? null };
}

export async function appendJobThreadSystemEvent(params: {
  jobId: string;
  jobSource: JobSource;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  const { data: auth } = await getCurrentAuthUser();
  const createdBy = auth.user?.id ?? null;

  const threadId = await ensureJobThread(params.jobId, params.jobSource);
  const client = supabase as any;
  const { error } = await client.from("job_thread_events").insert({
    thread_id: threadId,
    event_type: params.eventType,
    metadata: params.metadata ?? {},
    created_by: createdBy,
  });

  return { error: error?.message ?? null };
}

export async function createJobThreadException(params: {
  jobId: string;
  jobSource: JobSource;
  exceptionType: "customer_not_present" | "wrong_vehicle" | "missing_parts" | "access_issue" | "safety_issue" | "other";
  note?: string;
  attachments?: string[];
}) {
  const { data: auth } = await getCurrentAuthUser();
  const createdBy = auth.user?.id;
  if (!createdBy) return { error: "Not authenticated" };

  const threadId = await ensureJobThread(params.jobId, params.jobSource);
  const client = supabase as any;
  const { error } = await client.from("job_thread_exceptions").insert({
    thread_id: threadId,
    job_id: params.jobId,
    exception_type: params.exceptionType,
    note: params.note ?? null,
    attachments: params.attachments ?? [],
    created_by: createdBy,
  });

  return { error: error?.message ?? null };
}
