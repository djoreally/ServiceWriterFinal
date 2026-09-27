import type { Database } from '@/libs/supabase/types';
import { getEnvVar } from '@/utils/get-env-var';
import { createClient } from '@supabase/supabase-js';

type AdminClient = ReturnType<typeof createClient<Database>>;

let client: AdminClient | null = null;

function getSupabaseAdminClient(): AdminClient {
  if (client) return client;
  client = createClient<Database>(
    getEnvVar(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    getEnvVar(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
  );
  return client;
}

export const supabaseAdminClient = new Proxy({} as AdminClient, {
  get(_target, property) {
    const resolved = getSupabaseAdminClient();
    const value = Reflect.get(resolved, property, resolved);
    return typeof value === 'function' ? value.bind(resolved) : value;
  },
});
