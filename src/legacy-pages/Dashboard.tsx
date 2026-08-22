import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardCockpit } from "@/components/dashboard/DashboardCockpit";
import { LowStockAlert } from "@/components/dashboard/LowStockAlert";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { DashboardSkeleton } from "@/components/loading/PageSkeletons";

const Dashboard = () => {
  const ownerName: string | null = null;
  const [pageReady, setPageReady] = useState(false);

  useEffect(() => {
    setPageReady(true);
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
