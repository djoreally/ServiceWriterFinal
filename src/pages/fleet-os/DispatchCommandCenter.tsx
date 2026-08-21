import { useCallback, useEffect, useState } from "react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { FleetCommandMap, type JobPinData } from "@/components/fleet/FleetCommandMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchFleetMapData } from "@/application/queries/fleet-map.query";
import { fetchFleetWorkOrders } from "@/application/queries/fleet.query";
import { subscribeTechnicianUpdates } from "@/application/queries/fleet-tracking.query";
import { useAuth } from "@packages/auth";
import { Truck, Users, ClipboardList, Navigation, AlertCircle } from "lucide-react";

const DispatchCommandCenter = () => {
  const { user } = useAuth();
  const [vans, setVans] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [mapData, woData] = await Promise.all([
        fetchFleetMapData(),
        fetchFleetWorkOrders(user.id),
      ]);
      setVans(mapData);
      setWorkOrders(woData);
    } catch (err) {
      console.error("Failed to load dispatch data", err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
    const { unsubscribe } = subscribeTechnicianUpdates("tech-locations", () => {
      loadData();
    });
    return unsubscribe;
  }, [loadData]);

  const jobPins: JobPinData[] = workOrders
    .filter(wo => wo.fleet_locations?.latitude && wo.fleet_locations?.longitude)
    .map(wo => ({
      id: wo.id,
      title: wo.service_type || "Service",
      lat: wo.fleet_locations.latitude,
      lng: wo.fleet_locations.longitude,
      assignedVanId: wo.assigned_van_id,
      status: wo.status,
      customerName: wo.fleet_clients?.company_name,
      scheduledTime: wo.scheduled_time || "TBD",
    }));

  return (
    <FleetOSLayout title="Dispatch Command Center">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-12rem)]">
        {/* Left Sidebar - Vans & Techs */}
        <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-2">
          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Truck className="h-4 w-4" /> Active Vans
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 space-y-2">
              {vans.map(van => (
                <div key={van.id} className="p-2 rounded-md border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-xs">{van.name}</span>
                    <Badge variant="outline" className="text-[10px] scale-90">{van.status}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span>{van.technician?.name || "Unassigned"}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ClipboardList className="h-4 w-4" /> Pending Orders
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 space-y-2">
              {workOrders.filter(wo => wo.status === 'scheduled').map(wo => (
                <div key={wo.id} className="p-2 rounded-md border border-border bg-blue-50/30 hover:bg-blue-50/50 transition-colors cursor-pointer">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-xs truncate max-w-[120px]">
                      {wo.fleet_clients?.company_name}
                    </span>
                    <span className="text-[10px] font-bold text-blue-600">{wo.scheduled_time}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{wo.service_type}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Center - Map */}
        <div className="lg:col-span-3 h-full">
          <FleetCommandMap
            vans={vans}
            jobs={jobPins}
            height="h-full"
          />
        </div>
      </div>
    </FleetOSLayout>
  );
};

export default DispatchCommandCenter;
