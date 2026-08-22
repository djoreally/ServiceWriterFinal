/**
 * DispatcherDashboard — purpose-built workspace for users with the `dispatcher` role.
 *
 * Each composed page (CommandCenter, DispatchEngine, Appointments) already renders
 * its own `AppLayout` (sidebar + header). Wrapping them in another AppLayout caused
 * a "double menu" / nested sidebar. We render the active page directly so it owns
 * the chrome, and surface a lightweight tab switcher via query string instead.
 *
 * NOTE: The former `work-orders` tab has been relocated into Fleet OS at
 * `/fleet-os/work-orders/invoicing`. Legacy `?tab=work-orders` URLs redirect
 * there so bookmarks keep working.
 */
import { lazy, Suspense, useMemo } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

const CommandCenter = lazy(() => import("./CommandCenter"));
const DispatchEngine = lazy(() => import("./DispatchEngine"));
const Appointments = lazy(() => import("./Appointments"));

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

type TabKey = "command-center" | "dispatch" | "appointments";

export default function DispatcherDashboard() {
  const [params] = useSearchParams();
  const rawTab = params.get("tab");
  const tab = (rawTab as TabKey) || "command-center";

  const ActivePage = useMemo(() => {
    switch (tab) {
      case "dispatch":
        return DispatchEngine;
      case "appointments":
        return Appointments;
      case "command-center":
      default:
        return CommandCenter;
    }
  }, [tab]);

  // Legacy redirect — the fleet WO + invoicing flow now lives in Fleet OS.
  if (rawTab === "work-orders") {
    return <Navigate to="/fleet-os/work-orders/invoicing" replace />;
  }


  return (
    <Suspense fallback={<Loading />}>
      <ActivePage />
    </Suspense>
  );
}
