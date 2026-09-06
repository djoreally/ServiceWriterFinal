/** Internal Inbox Query Layer — canonical job-thread runtime only. */
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export async function fetchInternalInboxCurrentUserId(): Promise<string | null> {
  const { data } = await getCurrentAuthUser();
  return data.user?.id ?? null;
}

export interface InternalInboxNewMessagePayload {
  id: string; thread_id: string; sender_id: string; sender_role: string; content: string; attachments: unknown; created_at: string; edited_at: string | null;
}
export type InternalThreadType = "direct" | "job";
export interface InternalThreadSummary {
  id: string; type: InternalThreadType; title: string; subtitle: string | null; appointment_id: string | null;
  last_message_at: string | null; last_message_preview: string | null; unread_count: number;
  participants: Array<{ user_id: string; role: string; name: string | null }>;
}
export interface InternalThreadMessage {
  id: string; thread_id: string; sender_id: string; sender_role: string; content: string; attachments: string[]; created_at: string; edited_at: string | null;
}

const client = () => supabase;

export function subscribeInternalInboxMessages(onInsert: (row: InternalInboxNewMessagePayload) => void): { unsubscribe: () => void; channel: RealtimeChannel } {
  const channel = supabase.channel("internal-inbox-rt").on("postgres_changes", { event: "INSERT", schema: "public", table: "job_thread_messages" }, (payload) => onInsert(payload.new as InternalInboxNewMessagePayload)).subscribe();
  return { channel, unsubscribe: () => { void supabase.removeChannel(channel); } };
}

export async function listInternalThreads(): Promise<InternalThreadSummary[]> {
  const { data: auth } = await getCurrentAuthUser();
  const me = auth.user?.id;
  if (!me) return [];

  const [{ data: parts }, { data: owned }] = await Promise.all([
    client().from("job_thread_participants").select("thread_id, last_read_at").eq("user_id", me).is("removed_at", null),
    client().from("job_threads").select("id").eq("owner_user_id", me),
  ]);
  const threadIds = Array.from(new Set([...(parts ?? []).map((row) => row.thread_id), ...(owned ?? []).map((row) => row.id)]));
  if (!threadIds.length) return [];

  const lastReadByThread = new Map((parts ?? []).map((row) => [row.thread_id, row.last_read_at ?? null]));
  const { data: threadsRaw, error: threadsError } = await client()
    .from("job_threads")
    .select("id, type, title, appointment_id, last_message_at, owner_user_id, archived_at, appointments:appointments(id, starts_at, status, metadata, customers(name))")
    .in("id", threadIds)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (threadsError) throw threadsError;

  const closed = new Set(["completed", "cancelled", "canceled", "no_show"]);
  const threads = (threadsRaw ?? []).filter((thread) => {
    if (thread.type !== "job") return true;
    const appointment = Array.isArray(thread.appointments) ? thread.appointments[0] : thread.appointments;
    return Boolean(appointment && !closed.has(appointment.status));
  });
  if (!threads.length) return [];

  const appointmentIds = threads.map((thread) => thread.appointment_id).filter((id): id is string => Boolean(id));
  const servicesByAppointment = new Map<string, string[]>();
  if (appointmentIds.length) {
    const { data: items } = await client().from("appointment_items").select("appointment_id, description, quantity").in("appointment_id", appointmentIds);
    for (const item of items ?? []) {
      const label = item.quantity && item.quantity > 1 ? `${item.description} ×${item.quantity}` : item.description;
      if (!label) continue;
      servicesByAppointment.set(item.appointment_id, [...(servicesByAppointment.get(item.appointment_id) ?? []), label]);
    }
  }

  const [{ data: latest }, { data: allParts }] = await Promise.all([
    client().from("job_thread_messages").select("thread_id, content, created_at").in("thread_id", threadIds).order("created_at", { ascending: false }),
    client().from("job_thread_participants").select("thread_id, user_id, role").in("thread_id", threadIds).is("removed_at", null),
  ]);
  const latestByThread = new Map<string, { content: string; created_at: string }>();
  for (const message of latest ?? []) if (!latestByThread.has(message.thread_id)) latestByThread.set(message.thread_id, message);

  const userIds = Array.from(new Set((allParts ?? []).map((row) => row.user_id)));
  const nameMap = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await client().from("profiles").select("id, display_name").in("id", userIds);
    for (const profile of profiles ?? []) nameMap.set(profile.id, profile.display_name || "Staff");
  }

  const unreadCounts = new Map<string, number>();
  await Promise.all(threads.map(async (thread) => {
    const lastRead = lastReadByThread.get(thread.id) ?? null;
    let query = client().from("job_thread_messages").select("id", { count: "exact", head: true }).eq("thread_id", thread.id).neq("sender_id", me);
    if (lastRead) query = query.gt("created_at", lastRead);
    const { count } = await query;
    unreadCounts.set(thread.id, count ?? 0);
  }));

  return threads.map((thread): InternalThreadSummary => {
    const appointment = Array.isArray(thread.appointments) ? thread.appointments[0] : thread.appointments;
    const metadata = appointment?.metadata && typeof appointment.metadata === "object" && !Array.isArray(appointment.metadata) ? appointment.metadata as Record<string, unknown> : {};
    const services = thread.appointment_id ? servicesByAppointment.get(thread.appointment_id) ?? [] : [];
    const serviceLabel = services.length <= 2 ? services.join(" + ") : `${services.slice(0, 2).join(" + ")} +${services.length - 2}`;
    const fallbackTitle = typeof metadata.title === "string" ? metadata.title : "Job";
    const customerName = appointment?.customers?.name ?? (typeof metadata.guest_name === "string" ? metadata.guest_name : null);
    const date = appointment?.starts_at ? new Date(appointment.starts_at).toLocaleDateString() : null;
    return {
      id: thread.id,
      type: thread.type as InternalThreadType,
      title: thread.type === "job" ? serviceLabel || fallbackTitle : thread.title || "Direct message",
      subtitle: thread.type === "job" ? [customerName, date].filter(Boolean).join(" · ") || null : null,
      appointment_id: thread.appointment_id,
      last_message_at: thread.last_message_at,
      last_message_preview: latestByThread.get(thread.id)?.content ?? null,
      unread_count: unreadCounts.get(thread.id) ?? 0,
      participants: (allParts ?? []).filter((row) => row.thread_id === thread.id).map((row) => ({ user_id: row.user_id, role: row.role, name: nameMap.get(row.user_id) ?? null })),
    };
  });
}

export async function fetchInternalThreadMessages(threadId: string): Promise<InternalThreadMessage[]> {
  const { data, error } = await client().from("job_thread_messages").select("id, thread_id, sender_id, sender_role, content, attachments, created_at, edited_at").eq("thread_id", threadId).is("deleted_at", null).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((message) => ({ ...message, attachments: Array.isArray(message.attachments) ? message.attachments.filter((value): value is string => typeof value === "string") : [] }));
}

export async function markThreadRead(threadId: string): Promise<void> {
  const { data: auth } = await getCurrentAuthUser();
  const me = auth.user?.id;
  if (!me) return;
  await client().from("job_thread_participants").update({ last_read_at: new Date().toISOString() }).eq("thread_id", threadId).eq("user_id", me);
}

export async function listDmCandidates(): Promise<Array<{ user_id: string; name: string; role: string }>> {
  const { data: auth } = await getCurrentAuthUser();
  const me = auth.user?.id;
  if (!me) return [];
  const { data: memberships } = await client().from("workspace_members").select("workspace_id, user_id, role").eq("user_id", me).eq("is_active", true);
  const workspaceIds = (memberships ?? []).map((row) => row.workspace_id);
  if (!workspaceIds.length) return [];
  const { data: members } = await client().from("workspace_members").select("user_id, role").in("workspace_id", workspaceIds).eq("is_active", true).neq("user_id", me);
  const ids = Array.from(new Set((members ?? []).map((row) => row.user_id)));
  if (!ids.length) return [];
  const { data: profiles } = await client().from("profiles").select("id, display_name").in("id", ids);
  const names = new Map((profiles ?? []).map((row) => [row.id, row.display_name || "Staff"]));
  return ids.map((id) => ({ user_id: id, name: names.get(id) ?? "Staff", role: (members ?? []).find((row) => row.user_id === id)?.role ?? "viewer" }));
}

export async function ensureDirectThread(otherUserId: string): Promise<string> {
  const { data, error } = await client().rpc("ensure_direct_thread", { p_other_user_id: otherUserId });
  if (error) throw error;
  return data as string;
}

export async function sendInternalMessage(params: { threadId: string; content: string; attachments?: string[] }): Promise<void> {
  const { error } = await client().rpc("send_internal_thread_message_v1", { p_thread_id: params.threadId, p_content: params.content, p_attachments: params.attachments ?? [] });
  if (error) throw error;
}
