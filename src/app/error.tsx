'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="loginPage">
      <section className="loginCard" role="alert">
        <h1>Service Writer hit an error</h1>
        <p>{error.message || 'The page could not be loaded.'}</p>
        <button className="primaryButton" type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
