/**
 * SMS queries - fetch inbound/outbound messages for 2-way inbox
 */
import { supabase } from "@/integrations/supabase/client";

export interface SmsMessage {
  id: string;
  direction: "inbound" | "outbound";
  phone: string; // counterparty number
  text: string;
  created_at: string;
  correlation_id?: string | null;
  status?: string | null;
  error_message?: string | null;
}

export interface SmsRecipient {
  appointment_id: string;
  customer_name: string;
  phone: string;
  status: string;
  scheduled_at: string;
}

export async function fetchSmsMessages(): Promise<SmsMessage[]> {
  const { data, error } = await supabase
    .from("sms_logs")
    .select("id, direction, recipient_hash, status, correlation_id, message_body, created_at, error_message")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching SMS logs:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    direction: row.direction,
    phone: row.recipient_hash || "Unknown",
    text: row.message_body || "",
    created_at: row.created_at,
    correlation_id: row.correlation_id,
    status: row.status,
    error_message: row.error_message,
  }));
}

/** Customers with appointments that are not completed/cancelled and have a phone */
export async function fetchSmsEligibleRecipients(): Promise<SmsRecipient[]> {
  const allowedStatuses = ["pending", "confirmed", "in_progress", "scheduled", "no_show"];
  const { data, error } = await supabase
    .from("appointments")
    .select("id, status, scheduled_date, scheduled_time, customer:customers(name, phone)")
    .in("status", allowedStatuses)
    .not("customer.phone", "is", null)
    .order("scheduled_date", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to load message recipients");
  }

  return (data || [])
    .filter((row) => row.customer?.phone)
    .map((row) => ({
      appointment_id: row.id,
      customer_name: row.customer?.name || "Customer",
      phone: row.customer?.phone as string,
      status: row.status,
      scheduled_at: `${row.scheduled_date} ${row.scheduled_time}`,
    }));
}

export interface AppointmentSmsTimelineRow {
  id: string;
  created_at: string;
  direction: string;
  status: string;
  message_type: string | null;
  message_body: string | null;
  to_number_last4: string | null;
  error_message: string | null;
}

const TIMELINE_COLUMNS =
  "id, created_at, direction, status, message_type, message_body, to_number_last4, error_message";

export async function fetchAppointmentSmsTimeline(params: {
  appointmentId: string;
  customerPhone?: string | null;
  scheduledDate?: string | null;
}): Promise<AppointmentSmsTimelineRow[]> {
  const { appointmentId, customerPhone, scheduledDate } = params;

  const { data, error } = await supabase
    .from("sms_logs")
    .select(TIMELINE_COLUMNS)
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (data && data.length > 0) return data as AppointmentSmsTimelineRow[];

  const last4 = customerPhone?.replace(/\D/g, "").slice(-4);
  if (!last4) return [];

  let fallback = supabase
    .from("sms_logs")
    .select(TIMELINE_COLUMNS)
    .eq("to_number_last4", last4)
    .order("created_at", { ascending: false })
    .limit(25);
  if (scheduledDate) {
    const start = new Date(`${scheduledDate}T00:00:00`);
    start.setDate(start.getDate() - 2);
    const end = new Date(`${scheduledDate}T00:00:00`);
    end.setDate(end.getDate() + 7);
    fallback = fallback
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());
  }
  const { data: fallbackData, error: fallbackError } = await fallback;
  if (fallbackError) throw fallbackError;
  return (fallbackData ?? []) as AppointmentSmsTimelineRow[];
}
