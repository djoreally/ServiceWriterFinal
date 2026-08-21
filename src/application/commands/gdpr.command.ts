import { supabase } from "@/integrations/supabase/client";

export async function getCurrentSession() {
  return supabase.auth.getSession();
}

export async function signOutCurrentUser() {
  return supabase.auth.signOut();
}
