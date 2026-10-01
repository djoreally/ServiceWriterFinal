/**
 * Internal Inbox Query Layer
 * Staff-only conversations: direct messages + job threads.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/** Resolve the current authenticated user's id (used by callers for "me" checks). */
export async function fetchInternalInboxCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await apiClient.get<{ data: { userId: string } }>("/v1/internal-inbox/me");
    return data?.userId ?? null;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

export interface InternalInboxNewMessagePayload {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_role: string;
  content: string;
  attachments: unknown;
  created_at: string;
  edited_at: string | null;
}

/**
 * Poll the inbox message feed for new rows and pass them to the callback.
 * This replaces the browser Supabase realtime subscription (websocket), which
 * has no server-side equivalent; the server exposes a `?since=` polling feed.
 */
export function subscribeInternalInboxMessages(
  onInsert: (row: InternalInboxNewMessagePayload) => void,
): { unsubscribe: () => void; channel: RealtimeChannel } {
  let since = new Date().toISOString();
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const poll = async () => {
    if (stopped) return;
    try {
      const { data } = await apiClient.get<{ data: InternalInboxNewMessagePayload[] }>(
        "/v1/internal-inbox/messages",
        { query: { since } },
      );
      const rows = data ?? [];
      if (rows.length > 0) {
        since = rows.reduce(
          (latest, row) => (row.created_at > latest ? row.created_at : latest),
          since,
        );
        if (!stopped) {
          for (const row of rows) onInsert(row);
        }
      }
    } catch {
      // Polling is best-effort — the next interval retries.
    }
  };

  timer = setInterval(() => {
    void poll();
  }, 5000);

  return {
    // No websocket channel exists in the polling model; kept for the
    // exported signature. Consumers only call `unsubscribe()`.
    channel: {} as RealtimeChannel,
    unsubscribe: () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}


export type InternalThreadType = "direct" | "job";

export interface InternalThreadSummary {
  id: string;
  type: InternalThreadType;
  title: string;
  subtitle: string | null;
  appointment_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  participants: Array<{ user_id: string; role: string; name: string | null }>;
}

export interface InternalThreadMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_role: string;
  content: string;
  attachments: string[];
  created_at: string;
  edited_at: string | null;
}

interface ServerThreadDetail {
  id: string;
  kind: "job" | "direct";
  title: string | null;
  appointmentId: string | null;
  jobContext: {
    id: string;
    title: string;
    jobNumber: string | null;
    customerName: string | null;
    scheduledDate: string | null;
  } | null;
  participants: Array<{
    userId: string;
    role: string | null;
    displayName: string | null;
    lastReadAt: string | null;
  }>;
  messages: InternalInboxNewMessagePayload[];
  lastReadAt: string | null;
  latestActivity: string;
  otherUser: { userId: string; displayName: string | null } | null;
}

function toThreadMessage(row: InternalInboxNewMessagePayload): InternalThreadMessage {
  return {
    id: row.id,
    thread_id: row.thread_id,
    sender_id: row.sender_id,
    sender_role: row.sender_role,
    content: row.content,
    attachments: Array.isArray(row.attachments)
      ? row.attachments.filter((attachment): attachment is string => typeof attachment === "string")
      : [],
    created_at: row.created_at,
    edited_at: row.edited_at,
  };
}

function toThreadSummary(detail: ServerThreadDetail, me: string | null): InternalThreadSummary {
  const messages = detail.messages ?? [];
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastReadAt = detail.lastReadAt;
  const unread_count = me
    ? messages.filter(
        (message) =>
          message.sender_id !== me && (!lastReadAt || message.created_at > lastReadAt),
      ).length
    : 0;

  const title =
    detail.kind === "job"
      ? detail.jobContext?.title ?? detail.title ?? "Job"
      : detail.title ?? detail.otherUser?.displayName ?? "Direct message";
  const customerName = detail.jobContext?.customerName ?? null;
  const scheduledDate = detail.jobContext?.scheduledDate ?? null;
  const subtitle =
    detail.kind === "job"
      ? customerName
        ? `${customerName}${scheduledDate ? ` · ${scheduledDate}` : ""}`
        : scheduledDate
      : null;

  return {
    id: detail.id,
    type: detail.kind,
    title,
    subtitle,
    appointment_id: detail.appointmentId,
    last_message_at: lastMessage?.created_at ?? detail.latestActivity ?? null,
    last_message_preview: lastMessage?.content ?? null,
    unread_count,
    participants: (detail.participants ?? []).map((participant) => ({
      user_id: participant.userId,
      role: participant.role ?? "",
      name: participant.displayName,
    })),
  };
}

/**
 * List every thread the current user can see (owner OR participant).
 * Returns enriched summaries with unread counts and titles.
 */
export async function listInternalThreads(): Promise<InternalThreadSummary[]> {
  const [me, { data }] = await Promise.all([
    fetchInternalInboxCurrentUserId(),
    apiClient.get<{ data: ServerThreadDetail[] }>("/v1/internal-inbox/threads"),
  ]);
  return (data ?? []).map((detail) => toThreadSummary(detail, me));
}

export async function fetchInternalThreadMessages(threadId: string): Promise<InternalThreadMessage[]> {
  const { data } = await apiClient.get<{ data: ServerThreadDetail }>(
    `/v1/internal-inbox/threads/${threadId}/messages`,
  );
  return (data?.messages ?? []).map(toThreadMessage);
}

export async function markThreadRead(threadId: string): Promise<void> {
  try {
    await apiClient.post(`/v1/internal-inbox/threads/${threadId}/read`, {});
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return;
    throw error;
  }
}

interface ServerDmCandidate {
  userId: string;
  displayName: string | null;
  subtitle: string | null;
}

/** List staff users in the current owner's tenant who can be DM'd. */
export async function listDmCandidates(): Promise<Array<{ user_id: string; name: string; role: string }>> {
  try {
    const { data } = await apiClient.get<{ data: ServerDmCandidate[] }>("/v1/internal-inbox/dm-candidates");
    return (data ?? []).map((candidate) => ({
      user_id: candidate.userId,
      name: candidate.displayName ?? "Staff",
      role: candidate.subtitle ?? "member",
    }));
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return [];
    throw error;
  }
}

export async function ensureDirectThread(otherUserId: string): Promise<string> {
  const { data } = await apiClient.post<{ data: { threadId: string } }>(
    "/v1/internal-inbox/threads/direct",
    { other_user_id: otherUserId },
  );
  return data.threadId;
}

export async function sendInternalMessage(params: {
  threadId: string;
  content: string;
  attachments?: string[];
}): Promise<void> {
  await apiClient.post(`/v1/internal-inbox/threads/${params.threadId}/messages`, {
    content: params.content,
    attachments: params.attachments ?? [],
  });
}
