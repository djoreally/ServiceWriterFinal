import { notFound } from 'next/navigation';

import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';

const modules: Record<string, { title: string; description: string }> = {
  customers: { title: 'Customers', description: 'Customer operations will be connected to the canonical server API in Step 2.' },
  vehicles: { title: 'Vehicles', description: 'Vehicle operations will be connected to the canonical server API in Step 2.' },
  services: { title: 'Service Catalog', description: 'Service catalog operations will be connected to the canonical server API in Step 2.' },
  appointments: { title: 'Appointments', description: 'Appointment operations will be connected to the canonical server API in Step 2.' },
  'work-orders': { title: 'Work Orders', description: 'Work order operations will be connected to the canonical server API in Step 2.' },
  quotes: { title: 'Quotes', description: 'Quote and approval operations will be connected to the canonical server API in Step 2.' },
  invoices: { title: 'Invoices', description: 'Invoice operations will be connected to the canonical server API in Step 2.' },
  payments: { title: 'Payments', description: 'Payment operations will be connected to the canonical server API in Step 2.' },
  settings: { title: 'Settings', description: 'Workspace settings will be connected to the canonical server API in Step 2.' },
};

export const dynamic = 'force-dynamic';

export default async function ModuleShellPage({
  params,
}: {
  params: { workspaceId: string; module: string };
}) {
  const moduleConfig = modules[params.module];
  if (!moduleConfig) notFound();

  const user = await requirePageUser();
  await requirePageWorkspace(user.id, params.workspaceId);

  return (
    <main className="content">
      <div className="pageHeader">
        <h1>{moduleConfig.title}</h1>
        <p>{moduleConfig.description}</p>
      </div>
      <section className="card">
        <h2>Application shell ready</h2>
        <p className="userMeta">
          This route is protected and workspace-scoped. Business data is intentionally not fetched from the browser.
        </p>
      </section>
    </main>
  );
}
