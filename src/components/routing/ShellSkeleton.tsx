/**
 * ShellSkeleton — the branded first paint for the legacy SPA shell.
 *
 * Rendered by `ClientOnlyShell` as the `next/dynamic` loading fallback for
 * the client-only application bundle. Because it is the fallback, it ships
 * inside the initial server HTML and paints before any application
 * JavaScript runs — this is what replaced the old blank full-screen div
 * that made cold loads look like a dead white page (§3.2.1 R2: no user
 * ever sees a blank page).
 *
 * Pure presentational markup: no hooks, no data, no client-only APIs, so
 * it renders identically on the server and during hydration.
 */
export default function ShellSkeleton() {
  return (
    <div role="status" aria-label="Loading Service Writer" className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <div className="flex h-14 items-center justify-between border-b border-border px-4 sm:px-6">
        <span className="text-base font-semibold tracking-tight">Service Writer</span>
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
      </div>

      <div className="flex">
        {/* Sidebar skeleton — desktop shape of the app */}
        <div className="hidden w-56 shrink-0 flex-col gap-2 border-r border-border p-4 md:flex" aria-hidden="true">
          {["w-4/5", "w-3/5", "w-4/5", "w-2/3", "w-3/5", "w-4/5"].map((w, i) => (
            <div key={i} className={`h-8 ${w} animate-pulse rounded-md bg-muted`} />
          ))}
        </div>

        {/* Content skeleton */}
        <main className="min-w-0 flex-1 p-4 sm:p-6" aria-hidden="true">
          <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
          <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded-md bg-muted" />

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-4">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
                  <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </div>

          <p className="mt-8 text-sm text-muted-foreground">Loading Service Writer…</p>
        </main>
      </div>
    </div>
  );
}
