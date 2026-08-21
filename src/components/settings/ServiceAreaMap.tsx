import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { requireMapboxToken } from "@/lib/mapbox";

interface ServiceAreaMapProps {
  coordinates: { lat: number; lng: number };
  radiusMiles: number;
}

export const ServiceAreaMap = ({ coordinates, radiusMiles }: ServiceAreaMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    let token: string;
    try {
      token = requireMapboxToken();
    } catch (err) {
      console.error(err);
      return;
    }

    mapboxgl.accessToken = token;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [coordinates.lng, coordinates.lat],
      zoom: getZoomForRadius(radiusMiles),
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Add marker for business location
    marker.current = new mapboxgl.Marker({ color: "#3b82f6" })
      .setLngLat([coordinates.lng, coordinates.lat])
      .addTo(map.current);

    // Add circle layer for service radius
    map.current.on("load", () => {
      if (!map.current) return;

      // Add source for the circle
      map.current.addSource("service-radius", {
        type: "geojson",
        data: createCircleGeoJSON(coordinates, radiusMiles),
      });

      // Add fill layer
      map.current.addLayer({
        id: "service-radius-fill",
        type: "fill",
        source: "service-radius",
        paint: {
          "fill-color": "#3b82f6",
          "fill-opacity": 0.15,
        },
      });

      // Add outline layer
      map.current.addLayer({
        id: "service-radius-outline",
        type: "line",
        source: "service-radius",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Update circle when radius changes
  useEffect(() => {
    if (!map.current) return;

    const source = map.current.getSource("service-radius") as mapboxgl.GeoJSONSource;
    if (source) {
      source.setData(createCircleGeoJSON(coordinates, radiusMiles));
    }

    map.current.setZoom(getZoomForRadius(radiusMiles));
    map.current.setCenter([coordinates.lng, coordinates.lat]);

    if (marker.current) {
      marker.current.setLngLat([coordinates.lng, coordinates.lat]);
    }
  }, [coordinates, radiusMiles]);

  return (
    <div className="relative w-full h-64 rounded-lg overflow-hidden border border-border">
      <div ref={mapContainer} className="absolute inset-0" />
      <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-md text-xs font-medium shadow-sm">
        {radiusMiles} mile radius
      </div>
    </div>
  );
};

// Helper function to calculate zoom level based on radius
function getZoomForRadius(radiusMiles: number): number {
  if (radiusMiles <= 5) return 11;
  if (radiusMiles <= 10) return 10;
  if (radiusMiles <= 25) return 9;
  if (radiusMiles <= 50) return 8;
  return 7;
}

// Helper function to create a circle GeoJSON
function createCircleGeoJSON(
  center: { lat: number; lng: number },
  radiusMiles: number
): GeoJSON.FeatureCollection {
  const points = 64;
  const radiusKm = radiusMiles * 1.60934;
  const coords: [number, number][] = [];

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);

    const lat = center.lat + (dy / 111.32);
    const lng = center.lng + (dx / (111.32 * Math.cos((center.lat * Math.PI) / 180)));

    coords.push([lng, lat]);
  }
  coords.push(coords[0]); // Close the polygon

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [coords],
        },
      },
    ],
  };
}
