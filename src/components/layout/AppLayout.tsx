import { useState } from "react";
import { useAuth } from "@packages/auth";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { MobileNav } from "./MobileNav";
import { BottomNavBar } from "./BottomNavBar";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { SessionExpiryWarning } from "@/components/security/SessionExpiryWarning";
import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { PageContainer } from "./PagePrimitives";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceIdentityBanner } from "./WorkspaceIdentityBanner";


interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export const AppLayout = ({ children, title = "Dashboard" }: AppLayoutProps) => {
  const { loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const showHamburgerMenu = useMediaQuery("(max-width: 1023px)");

  // Auth/session enforcement is handled centrally by `RequireAuth` in App.tsx.
  // No layout-level navigate effect → no double redirect race.

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6" role="status" aria-live="polite" aria-label="Loading workspace">
        <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[220px_1fr]">
          <aside className="hidden space-y-4 rounded-lg border bg-card p-4 lg:block" aria-hidden="true">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-11/12" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-10/12" />
            <Skeleton className="h-8 w-full" />
          </aside>
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border bg-card p-4">
              <Skeleton className="h-8 w-48" />
              <div className="flex gap-3">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-9 w-9 rounded-full" />
              </div>
            </div>
            <div className="space-y-4" aria-hidden="true">
              <Skeleton className="h-9 w-64" />
              <div className="grid gap-4 sm:grid-cols-3">
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

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-background flex">
      {/* Session security: auto sign-out on idle/expiry */}
      <SessionExpiryWarning />
      <GlobalCommandPalette />

      {!showHamburgerMenu && <Sidebar />}
      
      {showHamburgerMenu && <MobileNav open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />}

      <div className="flex-1 flex flex-col w-0 min-h-screen lg:min-h-0">
        <TopHeader 
          title={title} 
          onMenuClick={() => setMobileMenuOpen(true)} 
          showMenuButton={showHamburgerMenu} 
        />
        <WorkspaceIdentityBanner />
        {/* Mobile/tablet: the document scrolls (no nested scroll container) so the
            last rows are always reachable. Desktop: the main region scrolls. */}
        <main className="flex-1 lg:overflow-y-auto px-3 py-4 sm:px-4 md:px-5 md:py-5 safe-bottom-content lg:pb-safe">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>

      {isMobile && <BottomNavBar />}
    </div>
  );


};
