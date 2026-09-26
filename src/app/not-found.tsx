import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="loginPage">
      <section className="loginCard">
        <h1>Page not found</h1>
        <p>This Service Writer page does not exist.</p>
        <Link className="primaryButton" href="/dashboard" style={{ display: 'block', textAlign: 'center' }}>
          Return to dashboard
        </Link>
      </section>
    </main>
  );
}
