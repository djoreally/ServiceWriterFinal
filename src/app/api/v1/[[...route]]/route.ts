import { handle } from 'hono/vercel';

import { createApiApp } from '@/api/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const app = createApiApp();
const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
