import { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { MAPBOX_DEFAULT_STYLE, requireMapboxToken } from '@/lib/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

interface LocationMapProps {
  lat: number;
  lng: number;
  /** Mapbox style URL; switches live via setStyle when it changes. */
  style?: string;
  /** Zoom level; satellite property views pass a closer zoom than street maps. */
  zoom?: number;
}

const LocationMap = ({ lat, lng, style, zoom }: LocationMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const appliedStyle = useRef<string>(style ?? MAPBOX_DEFAULT_STYLE);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

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
      style: appliedStyle.current,
      center: [lng, lat],
      zoom: zoom ?? 14,
      interactive: false, // Static preview, non-interactive
    });

    // Add marker
    new mapboxgl.Marker({ color: '#3b82f6' })
      .setLngLat([lng, lat])
      .addTo(map.current);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [lat, lng]);

  useEffect(() => {
    const next = style ?? MAPBOX_DEFAULT_STYLE;
    if (map.current && next !== appliedStyle.current) {
      appliedStyle.current = next;
      map.current.setStyle(next); // Markers are DOM overlays and survive a style swap.
    }
  }, [style]);

  useEffect(() => {
    if (map.current && zoom !== undefined) {
      map.current.setZoom(zoom);
    }
  }, [zoom]);

  return <div ref={mapContainer} className="w-full h-full" />;
};

export default LocationMap;
