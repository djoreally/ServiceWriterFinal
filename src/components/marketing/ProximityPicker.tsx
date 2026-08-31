/**
 * ProximityPicker — Mapbox picker for setting a segment's geo center + radius.
 *
 * Click the map to drop / move the center pin. Drag the slider to change the
 * radius (in miles). All three values are pushed back to the parent via onChange.
 */
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Crosshair, MapPin } from "lucide-react";
import { requireMapboxToken } from "@/lib/mapbox";

export interface ProximityValue {
  lat: number | null;
  lng: number | null;
  radiusMiles: number;
}

interface Props {
  value: ProximityValue;
  onChange: (next: ProximityValue) => void;
}

const DEFAULT_CENTER = { lat: 39.5, lng: -98.35 }; // continental US
const SOURCE_ID = "proximity-radius";

function circleGeoJSON(lat: number, lng: number, radiusMiles: number): GeoJSON.FeatureCollection {
  const points = 64;
  const radiusKm = radiusMiles * 1.60934;
  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);
    const lat2 = lat + dy / 111.32;
    const lng2 = lng + dx / (111.32 * Math.cos((lat * Math.PI) / 180));
    coords.push([lng2, lat2]);
  }
  coords.push(coords[0]);
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } }],
  };
}

function zoomForRadius(r: number): number {
  if (r <= 5) return 11;
  if (r <= 10) return 10;
  if (r <= 25) return 9;
  if (r <= 50) return 8;
  return 7;
}

export function ProximityPicker({ value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const hasCenter = value.lat != null && value.lng != null;
  const lat = value.lat ?? DEFAULT_CENTER.lat;
  const lng = value.lng ?? DEFAULT_CENTER.lng;
  const radius = value.radiusMiles || 10;

  useEffect(() => {
    if (!containerRef.current) return;
    let token: string;
    try {
      token = requireMapboxToken();
    } catch (e) {
      console.error(e);
      return;
    }
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [lng, lat],
      zoom: hasCenter ? zoomForRadius(radius) : 3,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: circleGeoJSON(lat, lng, radius),
      });
      map.addLayer({
        id: `${SOURCE_ID}-fill`,
        type: "fill",
        source: SOURCE_ID,
        paint: { "fill-color": "#0a84ff", "fill-opacity": hasCenter ? 0.15 : 0 },
      });
      map.addLayer({
        id: `${SOURCE_ID}-outline`,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#0a84ff",
          "line-width": 2,
          "line-dasharray": [2, 2],
          "line-opacity": hasCenter ? 1 : 0,
        },
      });
    });

    map.on("click", (e) => {
      const next: ProximityValue = {
        lat: e.lngLat.lat,
        lng: e.lngLat.lng,
        radiusMiles: valueRef.current.radiusMiles || 10,
      };
      onChange(next);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };

  }, [hasCenter, lat, lng, onChange, radius]);

  // Sync marker + circle whenever value changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(circleGeoJSON(lat, lng, radius));
      const fill = map.getLayer(`${SOURCE_ID}-fill`);
      const line = map.getLayer(`${SOURCE_ID}-outline`);
      if (fill) map.setPaintProperty(`${SOURCE_ID}-fill`, "fill-opacity", hasCenter ? 0.15 : 0);
      if (line) map.setPaintProperty(`${SOURCE_ID}-outline`, "line-opacity", hasCenter ? 1 : 0);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);

    if (hasCenter) {
      if (!markerRef.current) {
        markerRef.current = new mapboxgl.Marker({ color: "#0a84ff", draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);
        markerRef.current.on("dragend", () => {
          const ll = markerRef.current!.getLngLat();
          onChange({ lat: ll.lat, lng: ll.lng, radiusMiles: valueRef.current.radiusMiles || 10 });
        });
      } else {
        markerRef.current.setLngLat([lng, lat]);
      }
      map.easeTo({ center: [lng, lat], zoom: zoomForRadius(radius), duration: 400 });
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [lat, lng, radius, hasCenter, onChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4" />
          Proximity targeting
        </Label>
        {hasCenter && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ lat: null, lng: null, radiusMiles: 0 })}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="relative w-full h-64 rounded-lg overflow-hidden border border-border">
        <div ref={containerRef} className="absolute inset-0" />
        {!hasCenter && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60">
            <div className="flex items-center gap-2 rounded-md bg-background/95 px-3 py-2 text-sm shadow-md">
              <Crosshair className="h-4 w-4 text-primary" />
              Click the map to set the segment center
            </div>
          </div>
        )}
        {hasCenter && (
          <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-md text-xs font-medium shadow-sm">
            {radius} mile radius
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Latitude</Label>
          <Input
            type="number"
            step="0.0001"
            value={value.lat ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                lat: e.target.value === "" ? null : parseFloat(e.target.value),
                radiusMiles: value.radiusMiles || 10,
              })
            }
            placeholder="—"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Longitude</Label>
          <Input
            type="number"
            step="0.0001"
            value={value.lng ?? ""}
            onChange={(e) =>
              onChange({
                ...value,
                lng: e.target.value === "" ? null : parseFloat(e.target.value),
                radiusMiles: value.radiusMiles || 10,
              })
            }
            placeholder="—"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Radius (miles)</Label>
          <Input
            type="number"
            min={1}
            max={250}
            value={radius}
            onChange={(e) =>
              onChange({ ...value, radiusMiles: Math.max(1, parseInt(e.target.value) || 1) })
            }
            disabled={!hasCenter}
          />
        </div>
      </div>

      <div className="px-1">
        <Slider
          value={[radius]}
          min={1}
          max={100}
          step={1}
          disabled={!hasCenter}
          onValueChange={(v) => onChange({ ...value, radiusMiles: v[0] })}
        />
      </div>
    </div>
  );
}

export default ProximityPicker;
