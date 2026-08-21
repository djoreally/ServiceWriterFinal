import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchTrackingWorkOrder, subscribeTechnicianUpdates } from "@/application/queries/fleet-tracking.query";
import { requireMapboxToken } from "@/lib/mapbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navigation, Clock, MapPin, Truck } from "lucide-react";

const ClientTrackingPage = () => {
  const { id } = useParams<{ id: string }>();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [techLocation, setTechLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchOrder = async () => {
      const { data } = await fetchTrackingWorkOrder(id);
      setOrder(data);
      if (data?.technicians?.current_location) {
        const loc = data.technicians.current_location as { lat: number; lng: number };
        setTechLocation(loc);
      }
      setLoading(false);
    };

    fetchOrder();

    const { unsubscribe } = subscribeTechnicianUpdates(`tracking-${id}`, (row) => {
      if (row.id === order?.assigned_technician_id && row.current_location) {
        setTechLocation(row.current_location);
      }
    });
    return unsubscribe;
  }, [id, order?.assigned_technician_id]);

  useEffect(() => {
    if (!mapContainer.current || !techLocation) return;

    if (!map.current) {
      const token = requireMapboxToken();
      mapboxgl.accessToken = token;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [techLocation.lng, techLocation.lat],
        zoom: 14,
      });

      const el = document.createElement("div");
      el.className = "tech-marker";
      el.innerHTML = `<div class="bg-primary p-2 rounded-md border-2 border-white shadow-lg text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h15l2 5h5v8h-3a3 3 0 0 1-6 0H8a3 3 0 0 1-6 0H1V3z"></path></svg>
      </div>`;

      marker.current = new mapboxgl.Marker({ element: el })
        .setLngLat([techLocation.lng, techLocation.lat])
        .addTo(map.current);
    } else {
      map.current.easeTo({
        center: [techLocation.lng, techLocation.lat],
        duration: 2000
      });
      marker.current?.setLngLat([techLocation.lng, techLocation.lat]);
    }
  }, [techLocation]);

  if (loading) return <div className="h-screen flex items-center justify-center">Loading tracking details...</div>;

  return (
    <div className="h-screen w-full relative">
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Floating Info Card */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md">
        <Card className="shadow-xl border-t-4 border-t-primary backdrop-blur-sm bg-background/95">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <Badge className="bg-emerald-500">Live Tracking</Badge>
              <div className="flex items-center gap-1 text-xs font-bold">
                <Clock className="h-3 w-3" />
                <span>ETA: 14 mins</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center">
                <Truck className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm">{order?.technicians?.name || "Your Technician"}</p>
                <p className="text-xs text-muted-foreground">En route to your location</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="truncate">{order?.fleet_locations?.address}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClientTrackingPage;
