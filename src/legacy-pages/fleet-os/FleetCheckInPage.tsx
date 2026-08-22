import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@packages/auth";
import { toast } from "sonner";
import {
  MapPin, LogIn, LogOut, Camera, Clock, Car, CheckCircle,
  Loader2, AlertTriangle, Navigation, ClipboardList,
} from "lucide-react";

import { fetchTodayWorkOrders, refreshWorkOrders, refreshCheckins } from "@/application/queries/fleet-checkin.query";
import type { FleetCheckInWorkOrder, FleetCheckInRecord } from "@/application/queries/fleet-checkin.query";
import { recordCheckIn } from "@/application/commands/fleet-checkin.command";

interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

const FleetCheckInPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [workOrders, setWorkOrders] = useState<FleetCheckInWorkOrder[]>([]);
  const [checkins, setCheckins] = useState<Record<string, FleetCheckInRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [geoLoading, setGeoLoading] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [currentPosition, setCurrentPosition] = useState<GeoPosition | null>(null);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      const result = await fetchTodayWorkOrders(user.id);
      setWorkOrders(result.workOrders);
      setCheckins(result.checkins);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const getLocation = (): Promise<GeoPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error("Geolocation not supported")); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => reject(new Error(err.message)),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const handleCheckin = async (workOrderId: string, checkinType: "arrival" | "departure" | "photo") => {
    if (!user?.id) return;
    setSubmitting(workOrderId + checkinType);
    setGeoLoading(true);

    let geo: GeoPosition | null = null;
    try {
      geo = await getLocation();
      setCurrentPosition(geo);
      setPositionError(null);
    } catch (e: any) {
      setPositionError(e.message);
      toast.error("Could not get GPS location — check-in recorded without coordinates");
    }
    setGeoLoading(false);

    try {
      await recordCheckIn({
        userId: user.id,
        workOrderId,
        checkinType,
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        accuracyMeters: geo?.accuracy ? Math.round(geo.accuracy) : null,
        notes: notes[workOrderId] || null,
      });

      // ⚡ Parallel refresh of checkins and work orders
      const [updatedCheckins, updatedOrders] = await Promise.all([
        refreshCheckins(workOrderId, user.id),
        refreshWorkOrders(user.id),
      ]);
      setCheckins((prev) => ({ ...prev, [workOrderId]: updatedCheckins }));
      setWorkOrders(updatedOrders);

      const labels = { arrival: "Arrival", departure: "Departure", photo: "Photo" };
      toast.success(`${labels[checkinType]} check-in recorded`);
      setNotes((prev) => ({ ...prev, [workOrderId]: "" }));
    } catch {
      toast.error("Failed to record check-in");
    }
    setSubmitting(null);
  };

  const priorityColors: Record<string, string> = {
    urgent: "bg-red-500/10 text-red-600",
    high: "bg-orange-500/10 text-orange-600",
    normal: "bg-muted text-muted-foreground",
    low: "bg-muted text-muted-foreground",
  };

  const checkinTypeIcon = (type: string) => {
    if (type === "arrival") return <LogIn className="h-3 w-3 text-emerald-600" />;
    if (type === "departure") return <LogOut className="h-3 w-3 text-red-500" />;
    return <Camera className="h-3 w-3 text-blue-500" />;
  };

  return (
    <FleetOSLayout title="Mobile Check-In">
      <div className="space-y-5 max-w-2xl">
        {currentPosition && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-700 text-sm">
            <Navigation className="h-4 w-4 shrink-0" />
            <span>GPS active — ±{Math.round(currentPosition.accuracy)}m accuracy</span>
          </div>
        )}
        {positionError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-700 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>GPS unavailable: {positionError}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <Badge variant="secondary" className="bg-muted">
            {workOrders.length} active job{workOrders.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : workOrders.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <CheckCircle className="h-12 w-12 mx-auto text-emerald-500/40 mb-3" />
              <p className="font-medium">No active jobs today</p>
              <p className="text-sm text-muted-foreground mt-1">
                All scheduled and in-progress work orders will appear here
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/fleet-os/work-orders")}>
                <ClipboardList className="h-4 w-4 mr-1" /> View All Work Orders
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {workOrders.map((wo) => {
              const woCi = checkins[wo.id] ?? [];
              const hasArrived = woCi.some((c) => c.checkin_type === "arrival");
              const hasDeparted = woCi.some((c) => c.checkin_type === "departure");
              const isInProgress = wo.status === "in_progress";

              return (
                <Card key={wo.id} className={isInProgress ? "border-primary/40" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-base font-mono">{wo.order_number}</CardTitle>
                          <Badge variant="secondary" className={priorityColors[wo.priority] || ""}>
                            {wo.priority}
                          </Badge>
                          {isInProgress && (
                            <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
                              In Progress
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium mt-0.5">{wo.service_type || "General Service"}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        {wo.scheduled_time && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {wo.scheduled_time}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {wo.fleet_vehicles && (
                        <div className="flex items-start gap-1.5 text-muted-foreground">
                          <Car className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium text-foreground">
                              {wo.fleet_vehicles.year} {wo.fleet_vehicles.make} {wo.fleet_vehicles.model}
                            </p>
                            {wo.fleet_vehicles.unit_number && <p>Unit #{wo.fleet_vehicles.unit_number}</p>}
                            {wo.fleet_vehicles.license_plate && <p className="font-mono">{wo.fleet_vehicles.license_plate}</p>}
                          </div>
                        </div>
                      )}
                      {wo.fleet_locations && (
                        <div className="flex items-start gap-1.5 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium text-foreground">{wo.fleet_locations.name}</p>
                            {wo.fleet_locations.address && <p>{wo.fleet_locations.address}</p>}
                            {wo.fleet_locations.city && <p>{wo.fleet_locations.city}, {wo.fleet_locations.state}</p>}
                          </div>
                        </div>
                      )}
                    </div>

                    {wo.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{wo.description}</p>
                    )}

                    {woCi.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Check-in History</p>
                        {woCi.map((ci) => (
                          <div key={ci.id} className="flex items-center gap-2 text-xs">
                            {checkinTypeIcon(ci.checkin_type)}
                            <span className="capitalize">{ci.checkin_type}</span>
                            <span className="text-muted-foreground">
                              {new Date(ci.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {ci.accuracy_meters && (
                              <span className="text-muted-foreground">±{ci.accuracy_meters}m</span>
                            )}
                            {ci.notes && <span className="text-muted-foreground truncate">— {ci.notes}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">Notes (optional)</Label>
                      <Textarea
                        rows={2}
                        placeholder="Mileage, condition notes, access issues…"
                        value={notes[wo.id] || ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [wo.id]: e.target.value }))}
                        className="text-sm mt-1"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      {!hasArrived && !hasDeparted && (
                        <Button
                          size="sm"
                          className="flex-1 min-w-[120px] bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={submitting === wo.id + "arrival" || geoLoading}
                          onClick={() => handleCheckin(wo.id, "arrival")}
                        >
                          {submitting === wo.id + "arrival" ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <LogIn className="h-4 w-4 mr-1" />
                          )}
                          Arrived on Site
                        </Button>
                      )}

                      {hasArrived && !hasDeparted && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={submitting === wo.id + "photo" || geoLoading}
                            onClick={() => handleCheckin(wo.id, "photo")}
                          >
                            {submitting === wo.id + "photo" ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Camera className="h-4 w-4 mr-1" />
                            )}
                            Log Update
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 min-w-[120px] bg-red-600 hover:bg-red-700 text-white"
                            disabled={submitting === wo.id + "departure" || geoLoading}
                            onClick={() => handleCheckin(wo.id, "departure")}
                          >
                            {submitting === wo.id + "departure" ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <LogOut className="h-4 w-4 mr-1" />
                            )}
                            Departed / Done
                          </Button>
                        </>
                      )}

                      {hasDeparted && (
                        <div className="flex items-center gap-2 text-emerald-600 text-sm">
                          <CheckCircle className="h-4 w-4" />
                          <span>Job completed</span>
                        </div>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => navigate(`/fleet-os/work-orders/${wo.id}`)}
                      >
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </FleetOSLayout>
  );
};

export default FleetCheckInPage;
