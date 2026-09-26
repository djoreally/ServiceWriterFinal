import { redirect } from 'next/navigation';

import { listPageWorkspaces, requirePageUser } from '@/server/auth/page-session';

export const dynamic = 'force-dynamic';

export default async function DashboardEntryPage() {
  const user = await requirePageUser();
  const workspaces = await listPageWorkspaces(user.id);

  if (workspaces.length === 0) {
    return (
      <main className="loginPage">
        <section className="loginCard">
          <h1>No active workspace</h1>
          <p>Your account is authenticated, but it is not assigned to a Service Writer workspace.</p>
          <form action="/api/auth/logout" method="post">
            <button className="primaryButton" type="submit">Sign out</button>
          </form>
        </section>
      </main>
    );
  }

  redirect(`/dashboard/${workspaces[0].id}`);
}
