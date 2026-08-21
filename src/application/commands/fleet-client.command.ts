/**
 * Fleet Client Command — Abstracts fleet client and contact creation
 */

import { supabase } from "@/integrations/supabase/client";

export interface FleetClientPayload {
  company_name: string;
  billing_email: string;
  ap_contact_name: string;
  ap_contact_email: string;
  ap_contact_phone: string;
  phone: string;
  address: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  payment_terms: string;
  portal_access_enabled: boolean;
  notes: string;
  // ERP fields
  credit_status: string;
  default_pricing_tier: string;
  tax_exempt: boolean;
  internal_notes: string;
  billing_notes: string;
  service_notes: string;
  communication_preference: string;
}

export interface FleetClientContactPayload {
  name: string;
  role: string;
  email: string;
  phone: string;
  can_approve_work: boolean;
  receives_invoices: boolean;
  receives_reports: boolean;
  is_primary: boolean;
  // Expanded permissions
  view_vehicles: boolean;
  view_service_history: boolean;
  request_service: boolean;
  manage_vehicles: boolean;
  download_reports: boolean;
  approve_quotes: boolean;
  communication_preference: string;
}

export async function createFleetClient(
  userId: string,
  form: FleetClientPayload,
  contacts: FleetClientContactPayload[]
) {
  // Create client
  const { data: client, error: clientErr } = await supabase
    .from("fleet_clients")
    .insert({ ...form, user_id: userId })
    .select("id")
    .single();

  if (clientErr) throw clientErr;

  // Create contacts
  const validContacts = contacts.filter((c) => c.name.trim());
  if (validContacts.length > 0) {
    const { error: contactErr } = await supabase.from("fleet_contacts").insert(
      validContacts.map((c) => ({
        ...c,
        fleet_client_id: client.id,
        user_id: userId,
      }))
    );
    if (contactErr) throw contactErr;
  }

  return client;
}
