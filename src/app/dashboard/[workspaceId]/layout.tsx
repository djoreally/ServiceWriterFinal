import Link from 'next/link';

import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';

const modules = [
  ['customers', 'Customers'],
  ['vehicles', 'Vehicles'],
  ['services', 'Service Catalog'],
  ['appointments', 'Appointments'],
  ['work-orders', 'Work Orders'],
  ['quotes', 'Quotes'],
  ['invoices', 'Invoices'],
  ['payments', 'Payments'],
  ['settings', 'Settings'],
] as const;

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { workspaceId: string };
}) {
  const user = await requirePageUser();
  const { workspace, memberships } = await requirePageWorkspace(user.id, params.workspaceId);
  const base = `/dashboard/${workspace.id}`;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href={base} className="brand">
          Service Writer
          <small>{workspace.name}</small>
        </Link>

        <nav className="nav" aria-label="Service Writer">
          <Link href={base}>Dashboard</Link>
          {modules.map(([slug, label]) => (
            <Link key={slug} href={`${base}/${slug}`}>{label}</Link>
          ))}
        </nav>

        <div className="sidebarFooter">
          {memberships.length > 1 ? (
            <div className="userMeta" style={{ color: '#9ca3af' }}>
              {memberships.length} workspaces available
            </div>
          ) : null}
          <form action="/api/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <div className="topbarTitle">{workspace.name}</div>
            <div className="userMeta">{workspace.role.replaceAll('_', ' ')}</div>
          </div>
          <div className="userMeta">{user.email}</div>
        </header>
        {children}
      </div>
    </div>
  );
}
