import CommandCenter from "@/pages/CommandCenter";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { FleetDispatcherActionQueue } from "@/components/fleet/FleetDispatcherActionQueue";

const FleetCommandCenterPage = () => (
  <FleetOSLayout title="Command Center">
    <div className="space-y-5">
      <FleetDispatcherActionQueue />
      <CommandCenter embedded />
    </div>
  </FleetOSLayout>
);

export default FleetCommandCenterPage;
