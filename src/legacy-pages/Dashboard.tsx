import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardCockpit } from "@/components/dashboard/DashboardCockpit";
import { LowStockAlert } from "@/components/dashboard/LowStockAlert";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { DashboardSkeleton } from "@/components/loading/PageSkeletons";
import { fetchBusinessSettings } from "@/application/queries/settings.query";

const Dashboard = () => {
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [pageReady, setPageReady] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchBusinessSettings()
      .then((settings) => {
        if (active) setOwnerName(settings?.owner_name || settings?.business_name || null);
      })
      .catch((error) => console.error("Dashboard identity fetch error:", error))
      .finally(() => {
        if (active) setPageReady(true);
      });
    return () => { active = false; };
  }, []);

  return (
    <AppLayout title="Dashboard">
      {pageReady ? (
        <div className="space-y-5">
          <LowStockAlert />
          <DashboardCockpit ownerName={ownerName} />
          <QuickActions />
        </div>
      ) : (
        <DashboardSkeleton />
      )}
    </AppLayout>
  );
};

export default Dashboard;
