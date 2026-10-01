/**
 * SMS queries - fetch inbound/outbound messages for 2-way inbox
 */
import { apiClient } from "@/lib/api-client";

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

interface SmsLogRow {
  id: string;
  direction: "inbound" | "outbound";
  recipient_hash?: string | null;
  status?: string | null;
  correlation_id?: string | null;
  message_body?: string | null;
  created_at: string;
  error_message?: string | null;
}

export async function fetchSmsMessages(): Promise<SmsMessage[]> {
  const { data } = await apiClient.get<{ data: SmsLogRow[] }>("/v1/sms/messages");
  return (data ?? []).map((row) => ({
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

interface EligibleRecipientRow {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string;
  customer?: { name?: string | null; phone?: string | null } | null;
}

/** Customers with appointments that are not completed/cancelled and have a phone */
export async function fetchSmsEligibleRecipients(): Promise<SmsRecipient[]> {
  const { data } = await apiClient.get<{ data: EligibleRecipientRow[] }>("/v1/sms/eligible-recipients");
  return (data ?? [])
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

export async function fetchAppointmentSmsTimeline(params: {
  appointmentId: string;
  customerPhone?: string | null;
  scheduledDate?: string | null;
}): Promise<AppointmentSmsTimelineRow[]> {
  const { appointmentId, customerPhone, scheduledDate } = params;
  const { data } = await apiClient.get<{ data: AppointmentSmsTimelineRow[] }>("/v1/sms/timeline", {
    query: {
      appointment_id: appointmentId,
      ...(customerPhone ? { customer_phone: customerPhone } : {}),
      ...(scheduledDate ? { scheduled_date: scheduledDate } : {}),
    },
  });
  return data ?? [];
}
