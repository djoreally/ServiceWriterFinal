/**
 * Email Testing Commands — Send test emails.
 */
import { supabase } from "@/integrations/supabase/client";

export async function invokeSendTestEmail(body: Record<string, unknown>) {
  return supabase.functions.invoke("send-email", {
    body: {
      source: "email_testing",
      ...body,
    },
  });
}
