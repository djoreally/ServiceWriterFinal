import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { FleetSidebar } from "./FleetSidebar";
import { FleetMobileNav } from "./FleetMobileNav";
import { FleetBottomNavBar } from "./FleetBottomNavBar";
import { TopHeader } from "./TopHeader";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useFleetMode } from "@/stores/fleetModeStore";
import { PageContainer } from "./PagePrimitives";

interface FleetOSLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export const FleetOSLayout = ({ children, title = "Fleet OS" }: FleetOSLayoutProps) => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { setFleetMode } = useFleetMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isMobile = useMediaQuery("(max-width: 767px)");
  const showHamburgerMenu = useMediaQuery("(max-width: 1023px)");

  useEffect(() => {
    setFleetMode(true);
  }, [setFleetMode]);

  useEffect(() => {
    if (!loading && !session) {
      navigate("/login");
    }
  }, [session, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading Fleet OS...</div>

      </div>
    );
  }

  // Do not mount authenticated Fleet queries while the redirect effect moves a
  // signed-out visitor to login. This keeps the expected signed-out response
  // quiet and avoids transient RLS errors/toasts.
  if (!session) return null;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      {!showHamburgerMenu && <FleetSidebar />}

      {/* Mobile sheet nav */}
      {showHamburgerMenu && (
        <FleetMobileNav open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col w-0">
        <TopHeader
          title={title}
          onMenuClick={() => setMobileMenuOpen(true)}
          showMenuButton={showHamburgerMenu}
        />
        <main className={`flex-1 overflow-auto px-3 py-4 sm:px-4 md:px-5 md:py-5 ${isMobile ? "safe-bottom-content" : "pb-safe"}`}>
          <PageContainer>{children}</PageContainer>
        </main>
      </div>

      {/* Mobile bottom nav */}
      {isMobile && <FleetBottomNavBar />}
    </div>
  );
};
