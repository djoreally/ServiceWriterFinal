import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { useFleetMode } from "@/stores/fleetModeStore";
import { AppShell } from "./AppShell";

interface FleetOSLayoutProps {
  children: React.ReactNode;
  title?: string;
}

/**
 * Fleet OS layout: owns fleet-mode activation and the sign-in redirect, then
 * delegates ALL chrome to AppShell (variant="fleet") — one navigation/header/
 * overlay implementation shared with the workspace shell.
 */
export const FleetOSLayout = ({ children, title = "Fleet OS" }: FleetOSLayoutProps) => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { setFleetMode } = useFleetMode();

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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading Fleet OS...</div>
      </div>
    );
  }

  // Do not mount authenticated Fleet queries while the redirect effect moves a
  // signed-out visitor to login. This keeps the expected signed-out response
  // quiet and avoids transient RLS errors/toasts.
  if (!session) return null;

  return <AppShell title={title} variant="fleet">{children}</AppShell>;
};
