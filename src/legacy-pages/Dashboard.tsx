import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardCockpit } from "@/components/dashboard/DashboardCockpit";

// Home (Total Redesign Part A, D-A1): the screen the nav calls "Home"
// carries that name in the header too. The greeting name now arrives in
// the cockpit payload itself (the signed-in user), so this page no
// longer fires a settings fetch just to greet — the cockpit is the
// screen's only data surface.
const Dashboard = () => {
  return (
    <AppLayout title="Home">
      <DashboardCockpit />
    </AppLayout>
  );
};

export default Dashboard;
