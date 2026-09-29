import { redirect } from 'next/navigation';
import { getOptionalPageUser } from '@/server/auth/page-session';

export const dynamic = 'force-dynamic';

function sanitizeNextParam(candidate?: string): string {
  if (!candidate || typeof candidate !== 'string') return '/dashboard';
  const trimmed = candidate.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.startsWith('/ ')
  ) {
    return '/dashboard';
  }
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') return '/dashboard';
    return parsed.pathname + parsed.search;
  } catch {
    return '/dashboard';
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string; next?: string };
}) {
  const user = await getOptionalPageUser();
  if (user) redirect('/dashboard');

  const next = sanitizeNextParam(searchParams?.next);

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
