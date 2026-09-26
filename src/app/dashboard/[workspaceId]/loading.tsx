export default function WorkspaceLoading() {
  return (
    <main className="content" aria-busy="true">
      <div className="pageHeader"><div className="skeleton" style={{ minHeight: 72 }} /></div>
      <div className="grid">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </main>
  );
}
