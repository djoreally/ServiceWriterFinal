import { supabase } from "@/integrations/supabase/client";

export async function fetchCurrentSessionUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export function subscribeCurrentSessionUserId(listener: (userId: string | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    listener(session?.user.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}
