import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { MobileNav } from "./MobileNav";
import { BottomNavBar } from "./BottomNavBar";
import { FleetSidebar } from "./FleetSidebar";
import { FleetMobileNav } from "./FleetMobileNav";
import { FleetBottomNavBar } from "./FleetBottomNavBar";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { SessionExpiryWarning } from "@/components/security/SessionExpiryWarning";
import { GlobalCommandPalette } from "./GlobalCommandPalette";
import { PageContainer } from "./PagePrimitives";
import { WorkspaceIdentityBanner } from "./WorkspaceIdentityBanner";

/**
 * AppShell — the single chrome entry point for the authenticated product.
 *
 * Both historical layouts (workspace AppLayout, FleetOSLayout) render through
 * this one shell so navigation, header, overlay and bottom-nav behavior cannot
 * drift between product modes:
 *   variant="workspace" → grouped Sidebar/MobileNav + BottomNavBar + identity
 *                         banner + command palette + session-expiry warning.
 *   variant="fleet"     → Fleet OS chrome (own nav identity, no palette).
 *
 * DOM structure and classes per variant are preserved from the legacy layouts.
 */

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  variant?: "workspace" | "fleet";
}

export const AppShell = ({ children, title = "Dashboard", variant = "workspace" }: AppShellProps) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const showHamburgerMenu = useMediaQuery("(max-width: 1023px)");
  const openMenu = () => setMobileMenuOpen(true);
  const closeMenu = () => setMobileMenuOpen(false);

  if (variant === "fleet") {
    return (
      <div className="flex min-h-screen bg-background">
        {!showHamburgerMenu && <FleetSidebar />}
        {showHamburgerMenu && <FleetMobileNav open={mobileMenuOpen} onClose={closeMenu} />}

        <div className="flex w-0 flex-1 flex-col">
          <TopHeader
            title={title}
            onMenuClick={openMenu}
            showMenuButton={showHamburgerMenu}
          />
          <main className={`flex-1 overflow-auto px-3 py-4 sm:px-4 md:px-5 md:py-5 ${isMobile ? "safe-bottom-content" : "pb-safe"}`}>
            <PageContainer>{children}</PageContainer>
          </main>
        </div>

        {isMobile && <FleetBottomNavBar />}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-background lg:h-screen lg:overflow-hidden" data-app-shell>
      <SessionExpiryWarning />
      <GlobalCommandPalette />
      {!showHamburgerMenu && <Sidebar />}
      {showHamburgerMenu && <MobileNav open={mobileMenuOpen} onClose={closeMenu} />}

      <div className="flex min-h-screen w-full min-w-0 max-w-full flex-1 flex-col lg:min-h-0">
        <TopHeader
          title={title}
          onMenuClick={openMenu}
          showMenuButton={showHamburgerMenu}
        />
        <WorkspaceIdentityBanner />
        <main className="safe-bottom-content w-full min-w-0 max-w-full flex-1 overflow-x-hidden px-4 py-4 sm:px-5 md:py-5 lg:overflow-y-auto lg:px-6 lg:pb-safe" data-app-main>
          <PageContainer>{children}</PageContainer>
        </main>
      </div>

      {isMobile && <BottomNavBar />}
    </div>
  );
};
