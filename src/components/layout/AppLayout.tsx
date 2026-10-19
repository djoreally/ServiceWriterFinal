import { useAuth } from "@packages/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "./AppShell";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

/**
 * Backwards-compatible workspace layout: keeps the historical loading skeleton,
 * then delegates ALL chrome to AppShell (single navigation/header/overlay
 * implementation shared with the Fleet OS variant).
 */
export const AppLayout = ({ children, title = "Dashboard" }: AppLayoutProps) => {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background p-4 sm:p-5 lg:p-6" role="status" aria-live="polite" aria-label="Loading workspace">
        <div className="mx-auto grid min-w-0 max-w-[1440px] gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="hidden space-y-4 rounded-lg border bg-card p-4 lg:block" aria-hidden="true">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-11/12" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-10/12" />
            <Skeleton className="h-8 w-full" />
          </aside>
          <div className="min-w-0 space-y-5">
            <div className="flex min-w-0 items-center justify-between rounded-lg border bg-card p-4">
              <Skeleton className="h-8 w-48 max-w-full" />
              <div className="flex shrink-0 gap-3">
                <Skeleton className="hidden h-9 w-40 sm:block" />
                <Skeleton className="h-9 w-9 rounded-full" />
              </div>
            </div>
            <div className="min-w-0 space-y-4" aria-hidden="true">
              <Skeleton className="h-9 w-64 max-w-full" />
              <div className="grid min-w-0 gap-4 sm:grid-cols-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
              <Skeleton className="h-72 w-full" />
            </div>
          </div>
        </div>
        <span className="sr-only">Loading workspace</span>
      </div>
    );
  }

  return <AppShell title={title} variant="workspace">{children}</AppShell>;
};
