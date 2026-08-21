import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type RetentionEventInsert = {
  event_name: string;
  aggregate_type: string;
  aggregate_id: string;
  user_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  payload_jsonb: Record<string, unknown>;
  occurred_at: string;
};

type RetentionEventDbInsert = Database["public"]["Tables"]["retention_events"]["Insert"];

export async function insertRetentionEvents(rows: RetentionEventInsert[]): Promise<void> {
  if (rows.length === 0) return;
  // payload_jsonb is `Record<string, unknown>` in the domain shape; cast to the
  // generated `Json` type at the DB boundary (PostgREST accepts any JSON-shaped value).
  const dbRows = rows as unknown as RetentionEventDbInsert[];
  const { error } = await supabase.from("retention_events").insert(dbRows);
  if (error) throw error;
}

export async function retryQueuedEmail(emailQueueId: string): Promise<void> {
  const { error: updErr } = await supabase
    .from("email_queue")
    .update({
      status: "pending",
      error_message: null,
      retry_count: 0,
      scheduled_for: new Date().toISOString(),
      sent_at: null,
    })
    .eq("id", emailQueueId);
  if (updErr) throw updErr;

  const { error: invErr } = await supabase.functions.invoke("transactional-email-worker", {
    body: { trigger: "manual_retry", email_queue_id: emailQueueId },
  });
  if (invErr) throw invErr;
}

export async function invokeRetentionWorker(userId: string): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("retention-worker", {
    body: { user_id: userId, scope: "verify_today" },
  });
  if (error) throw error;
  return data;
}
