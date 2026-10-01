import { apiClient } from "@/lib/api-client";
import type { JobSource } from "@/application/queries/job-thread.query";
import type { JobCommunicationRole } from "@packages/shared/lifecycle";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

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
  try {
    const response = await apiClient.post<{ data: { message_id: string | null; thread_id: string } }>(
      "/v1/job-threads/messages",
      {
        job_id: params.jobId,
        job_source: params.jobSource,
        content: params.content,
        channel: params.channel ?? "dispatch",
        recipient: params.recipient ?? null,
        attachments: params.attachments ?? [],
        client_message_id: params.clientMessageId ?? crypto.randomUUID(),
      },
    );
    return { data: response.data.message_id, error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
}

export async function appendJobThreadSystemEvent(params: {
  jobId: string;
  jobSource: JobSource;
  eventType: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await apiClient.post("/v1/job-threads/events", {
      job_id: params.jobId,
      job_source: params.jobSource,
      event_type: params.eventType,
      metadata: params.metadata ?? {},
    });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function createJobThreadException(params: {
  jobId: string;
  jobSource: JobSource;
  exceptionType: "customer_not_present" | "wrong_vehicle" | "missing_parts" | "access_issue" | "safety_issue" | "other";
  note?: string;
  attachments?: string[];
}) {
  try {
    await apiClient.post("/v1/job-threads/exceptions", {
      job_id: params.jobId,
      job_source: params.jobSource,
      exception_type: params.exceptionType,
      note: params.note ?? null,
      attachments: params.attachments ?? [],
    });
    return { error: null };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
