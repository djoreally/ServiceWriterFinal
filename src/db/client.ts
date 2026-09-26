import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let queryClient: ReturnType<typeof postgres> | undefined;

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required on the Service Writer API server.');
  return url;
}

export function getQueryClient() {
  queryClient ??= postgres(getDatabaseUrl(), {
    max: 10,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return queryClient;
}

export function getDb() {
  return drizzle(getQueryClient());
}

