export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1>ServiceWriter API bridge</h1>
      <p>The greenfield Next.js backend is ready for the preserved frontend integration.</p>
      <p>Use <code>/api/v1/health</code> to verify deployment health.</p>
    </main>
  );
}
