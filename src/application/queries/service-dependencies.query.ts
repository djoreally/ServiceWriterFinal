/**
 * Service Dependencies Query — Fetches service template dependencies
 */

import { supabase } from "@/integrations/supabase/client";

export async function fetchServiceDependenciesData() {
  return Promise.all([
    supabase.from("service_template_dependencies").select("*"),
    supabase.from("service_templates").select("id, name, default_price").eq("is_active", true),
  ]);
}
