import { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { MAPBOX_DEFAULT_STYLE, requireMapboxToken } from '@/lib/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

interface LocationMapProps {
  lat: number;
  lng: number;
}

const LocationMap = ({ lat, lng }: LocationMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);

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
      style: MAPBOX_DEFAULT_STYLE,
      center: [lng, lat],
      zoom: 14,
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

  return <div ref={mapContainer} className="w-full h-full" />;
};

export default LocationMap;
