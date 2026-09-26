import { Hono } from 'hono';

import { registerCustomerRoutes } from './routes/customers';

/** HTTP composition root. Business logic belongs in application modules, never here. */
export function createApiApp() {
  const app = new Hono().basePath('/api/v1');
  registerCustomerRoutes(app);
  return app;
}

export type ServiceWriterApi = ReturnType<typeof createApiApp>;
