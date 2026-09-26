export default function Loading() {
  return (
    <main className="content" aria-busy="true" aria-label="Loading Service Writer">
      <div className="pageHeader">
        <div className="skeleton" style={{ minHeight: 70 }} />
      </div>
      <div className="grid">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </main>
  );
}
