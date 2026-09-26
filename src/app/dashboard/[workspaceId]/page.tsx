import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';

export const dynamic = 'force-dynamic';

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const user = await requirePageUser();
  const { workspace } = await requirePageWorkspace(user.id, params.workspaceId);

  return (
    <main className="content">
      <div className="pageHeader">
        <h1>Dashboard</h1>
        <p>{workspace.name} is connected to the clean Next.js server application.</p>
      </div>

      <section className="grid">
        <article className="card">
          <div className="kicker">Workspace</div>
          <div className="metric">{workspace.name}</div>
          <p className="userMeta">Tenant context is verified server-side.</p>
        </article>
        <article className="card">
          <div className="kicker">Role</div>
          <div className="metric" style={{ textTransform: 'capitalize' }}>{workspace.role.replaceAll('_', ' ')}</div>
          <p className="userMeta">Authorization remains enforced by the server.</p>
        </article>
        <article className="card">
          <div className="kicker">Architecture</div>
          <div className="metric">Next.js</div>
          <p className="userMeta">Hono transport + server-only application services + Drizzle.</p>
        </article>
      </section>
    </main>
  );
}
