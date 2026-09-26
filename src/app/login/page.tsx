import { redirect } from 'next/navigation';
import { getOptionalPageUser } from '@/server/auth/page-session';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string; next?: string };
}) {
  const user = await getOptionalPageUser();
  if (user) redirect('/dashboard');

  const next = typeof searchParams?.next === 'string' && searchParams.next.startsWith('/')
    ? searchParams.next
    : '/dashboard';

  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="brand" style={{ color: 'var(--text)', marginBottom: 24 }}>
          Service Writer
          <small>Shop Operations</small>
        </div>
        <h1>Sign in</h1>
        <p>Use your Service Writer account to continue.</p>

        {searchParams?.error ? <div className="errorBox">{searchParams.error}</div> : null}

        <form action="/api/auth/login" method="post">
          <input type="hidden" name="next" value={next} />
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="primaryButton" type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}
