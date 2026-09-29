import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let queryClient: ReturnType<typeof postgres> | undefined;
let dbInstance: ReturnType<typeof drizzle> | undefined;

function getDatabaseUrl() {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  ];
  const url = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  if (!url) {
    throw new Error(
      'A database connection URL is required. Set DATABASE_URL or one of the existing Vercel Postgres URL aliases.',
    );
  }
  return url;
}

export function getQueryClient() {
  queryClient ??= postgres(getDatabaseUrl(), {
    max: process.env.NODE_ENV === 'production' ? 2 : 10,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return queryClient;
}

export function getDb() {
  dbInstance ??= drizzle(getQueryClient());
  return dbInstance;
}
