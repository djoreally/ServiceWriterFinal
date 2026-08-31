/**
 * Internal Inbox Query Layer
 * Staff-only conversations: direct messages + job threads.
 */
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Resolve the current authenticated user's id (used by callers for "me" checks). */
export async function fetchInternalInboxCurrentUserId(): Promise<string | null> {
  const { data } = await getCurrentAuthUser();
  return data.user?.id ?? null;
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

/** Subscribe to job_thread_messages INSERTs and pass raw rows to the callback. */
export function subscribeInternalInboxMessages(
  onInsert: (row: InternalInboxNewMessagePayload) => void,
): { unsubscribe: () => void; channel: RealtimeChannel } {
  const channel = supabase
    .channel("internal-inbox-rt")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "job_thread_messages" },
      (payload) => onInsert(payload.new as InternalInboxNewMessagePayload),
    )
    .subscribe();
  return {
    channel,
    unsubscribe: () => {
      supabase.removeChannel(channel);
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

const client = () => supabase;

/**
 * List every thread the current user can see (owner OR participant).
 * Returns enriched summaries with unread counts and titles.
 */
export async function listInternalThreads(): Promise<InternalThreadSummary[]> {
  const { data: auth } = await getCurrentAuthUser();
  const me = auth.user?.id;
  if (!me) return [];

  // 1. Get participant rows for the current user
  const { data: parts } = await client()
    .from("job_thread_participants")
    .select("thread_id, last_read_at")
    .eq("user_id", me)
    .is("removed_at", null);

  // 2. Owned threads (admins always see their threads even before being added)
  const { data: owned } = await client()
    .from("job_threads")
    .select("id")
    .eq("owner_user_id", me);

  const threadIds = Array.from(
    new Set([
      ...(parts || []).map((participant) => participant.thread_id),
      ...(owned || []).map((thread) => thread.id),
    ]),
  );
  if (threadIds.length === 0) return [];

  const lastReadByThread = new Map<string, string | null>(
    (parts || []).map((participant) => [participant.thread_id, participant.last_read_at ?? null]),
  );

  // 3. Threads + appointment titles + status (so we can hide closed jobs)
  const { data: threadsRaw } = await client()
    .from("job_threads")
    .select(
      "id, type, title, appointment_id, last_message_at, owner_user_id, archived_at, appointments:appointments(title, scheduled_date, scheduled_time, status, dispatch_status, customers(name), guest_name)",
    )
    .in("id", threadIds)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  // Hide job threads whose appointment is completed/cancelled. Direct messages always stay.
  const CLOSED = new Set(["completed", "cancelled", "canceled", "no_show"]);
  const threads = (threadsRaw || []).filter((thread) => {
    if (thread.type !== "job") return true;
    const apt = Array.isArray(thread.appointments) ? thread.appointments[0] : thread.appointments;
    if (!apt) return false; // orphaned job thread — hide
    return !CLOSED.has(apt.status) && !CLOSED.has(apt.dispatch_status);
  });

  if (threads.length === 0) return [];

  // 3b. Service names per appointment (so the thread is identified by the work, not the booking).
  const appointmentIds = Array.from(
    new Set(
      threads
        .map((thread) => thread.appointment_id)
        .filter((x: string | null): x is string => !!x),
    ),
  );
  const servicesByAppointment = new Map<string, string[]>();
  if (appointmentIds.length > 0) {
    const { data: apptServices } = await client()
      .from("appointment_services")
      .select("appointment_id, name, quantity")
      .in("appointment_id", appointmentIds);
    for (const s of apptServices || []) {
      const arr = servicesByAppointment.get(s.appointment_id) || [];
      const label = s.quantity > 1 ? `${s.name} ×${s.quantity}` : s.name;
      arr.push(label);
      servicesByAppointment.set(s.appointment_id, arr);
    }
  }

  // 4. Latest message per thread (lightweight: one query)
  const { data: latest } = await client()
    .from("job_thread_messages")
    .select("thread_id, content, created_at")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: false });

  const latestByThread = new Map<string, { content: string; created_at: string }>();
  for (const m of latest || []) {
    if (!latestByThread.has(m.thread_id)) latestByThread.set(m.thread_id, { content: m.content, created_at: m.created_at });
  }

  // 5. Unread counts
  const unreadCounts = new Map<string, number>();
  await Promise.all(
    threads.map(async (thread) => {
      const lastRead = lastReadByThread.get(thread.id) ?? null;
      const q = client()
        .from("job_thread_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", thread.id)
        .neq("sender_id", me);
      const { count } = lastRead ? await q.gt("created_at", lastRead) : await q;
      unreadCounts.set(thread.id, count || 0);
    }),
  );

  // 6. Participants list (names)
  const { data: allParts } = await client()
    .from("job_thread_participants")
    .select("thread_id, user_id, role")
    .in("thread_id", threadIds)
    .is("removed_at", null);

  const userIds = Array.from(new Set((allParts || []).map((participant) => participant.user_id)));
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: techs } = await client()
      .from("technicians")
      .select("auth_user_id, user_id, name")
      .or(`auth_user_id.in.(${userIds.join(",")}),user_id.in.(${userIds.join(",")})`);
    for (const t of techs || []) {
      const key = (t.auth_user_id as string) || (t.user_id as string);
      if (key && !nameMap.has(key)) nameMap.set(key, t.name || "Staff");
    }
    const { data: profiles } = await client()
      .from("business_profiles")
      .select("user_id, business_name, owner_name")
      .in("user_id", userIds);
    for (const p of profiles || []) {
      if (!nameMap.has(p.user_id)) nameMap.set(p.user_id, p.owner_name || p.business_name || "Owner");
    }
  }

  return threads.map((t): InternalThreadSummary => {
    const apt = Array.isArray(t.appointments) ? t.appointments[0] : t.appointments;
    const customerName = apt?.customers?.name || apt?.guest_name || null;
    const services = (t.appointment_id && servicesByAppointment.get(t.appointment_id)) || [];
    // Job threads are identified by the SERVICE being performed, not the appointment booking.
    // Fallback chain: service names → appointment.title → "Job".
    const serviceLabel =
      services.length === 0
        ? null
        : services.length <= 2
          ? services.join(" + ")
          : `${services.slice(0, 2).join(" + ")} +${services.length - 2}`;
    const title =
      t.type === "job"
        ? serviceLabel || apt?.title || "Job"
        : t.title || "Direct message";
    const subtitle =
      t.type === "job"
        ? customerName
          ? `${customerName}${apt?.scheduled_date ? ` · ${apt.scheduled_date}` : ""}`
          : apt?.scheduled_date || null
        : null;
    return {
      id: t.id,
      type: t.type,
      title,
      subtitle,
      appointment_id: t.appointment_id,
      last_message_at: t.last_message_at,
      last_message_preview: latestByThread.get(t.id)?.content ?? null,
      unread_count: unreadCounts.get(t.id) ?? 0,
      participants: (allParts || [])
        .filter((participant) => participant.thread_id === t.id)
        .map((participant) => ({
          user_id: participant.user_id,
          role: participant.role,
          name: nameMap.get(participant.user_id) ?? null,
        })),
    };
  });
}

export async function fetchInternalThreadMessages(threadId: string): Promise<InternalThreadMessage[]> {
  const { data, error } = await client()
    .from("job_thread_messages")
    .select("id, thread_id, sender_id, sender_role, content, attachments, created_at, edited_at")
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((message) => ({
    ...message,
    attachments: Array.isArray(message.attachments)
      ? message.attachments.filter((attachment): attachment is string => typeof attachment === "string")
      : [],
  }));
}

export async function markThreadRead(threadId: string): Promise<void> {
  const { data: auth } = await getCurrentAuthUser();
  const me = auth.user?.id;
  if (!me) return;
  await client()
    .from("job_thread_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("user_id", me);
}

/** List staff users in the current owner's tenant who can be DM'd. */
export async function listDmCandidates(): Promise<Array<{ user_id: string; name: string; role: string }>> {
  const { data: auth } = await getCurrentAuthUser();
  const me = auth.user?.id;
  if (!me) return [];

  // Owner = me (admin) or owner_user_id from team_user_links
  const { data: link } = await client()
    .from("team_user_links")
    .select("owner_user_id")
    .eq("member_user_id", me)
    .maybeSingle();
  const ownerId = link?.owner_user_id || me;

  const { data: links } = await client()
    .from("team_user_links")
    .select("member_user_id, role")
    .eq("owner_user_id", ownerId);

  const candidates: Array<{ user_id: string; name: string; role: string }> = [];
  const userIds = (links || []).map((teamLink) => teamLink.member_user_id).filter((userId) => userId !== me);
  // Include the owner if I'm a team member (not the owner)
  if (ownerId !== me) userIds.push(ownerId);

  if (userIds.length === 0) return [];

  // Names: technicians first, then business_profiles
  const { data: techs } = await client()
    .from("technicians")
    .select("auth_user_id, user_id, name")
    .or(`auth_user_id.in.(${userIds.join(",")}),user_id.in.(${userIds.join(",")})`);
  const nameMap = new Map<string, string>();
  for (const t of techs || []) {
    const k = (t.auth_user_id as string) || (t.user_id as string);
    if (k && !nameMap.has(k)) nameMap.set(k, t.name || "Staff");
  }
  const { data: profiles } = await client()
    .from("business_profiles")
    .select("user_id, business_name, owner_name")
    .in("user_id", userIds);
  for (const p of profiles || []) {
    if (!nameMap.has(p.user_id)) nameMap.set(p.user_id, p.owner_name || p.business_name || "Owner");
  }

  for (const uid of userIds) {
    const role = (links || []).find((teamLink) => teamLink.member_user_id === uid)?.role || "admin";
    candidates.push({ user_id: uid, name: nameMap.get(uid) || "Staff", role });
  }
  return candidates;
}

export async function ensureDirectThread(otherUserId: string): Promise<string> {
  const { data, error } = await client().rpc("ensure_direct_thread", { p_other_user_id: otherUserId });
  if (error) throw error;
  return data as string;
}

export async function sendInternalMessage(params: {
  threadId: string;
  content: string;
  attachments?: string[];
}): Promise<void> {
  const { error } = await client().rpc("send_internal_thread_message_v1", {
    p_thread_id: params.threadId,
    p_content: params.content,
    p_attachments: params.attachments ?? [],
  });
  if (error) throw error;
}
