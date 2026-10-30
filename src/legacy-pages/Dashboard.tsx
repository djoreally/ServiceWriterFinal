import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardCockpit } from "@/components/dashboard/DashboardCockpit";
import { LowStockAlert } from "@/components/dashboard/LowStockAlert";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { fetchBusinessSettings } from "@/application/queries/settings.query";

const Dashboard = () => {
  const [ownerName, setOwnerName] = useState<string | null>(null);

  // The settings fetch only supplies the greeting name — it must not gate
  // the page. The cockpit renders immediately with its own loading states
  // and fires its data queries in parallel; the name fills in when the
  // settings arrive (§3.2.1 R3: never serialize content behind a
  // cosmetic fetch).
  useEffect(() => {
    let active = true;
    void fetchBusinessSettings()
      .then((settings) => {
        if (active) setOwnerName(settings?.owner_name || settings?.business_name || null);
      })
      .catch((error) => console.error("Dashboard identity fetch error:", error));
    return () => { active = false; };
  }, []);

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-5">
        <LowStockAlert />
        <DashboardCockpit ownerName={ownerName} />
        <QuickActions />
      </div>
    </AppLayout>
  );
};

export default Dashboard;
