import { useState, useEffect, lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, ExternalLink, Loader2, Route, Clock } from 'lucide-react';
import { geocodeAddress, getDrivingRoute } from '@/application/queries/mapbox';
import { fetchCurrentBusinessBaseCoordinates } from '@/application/queries/business-profile.query';

// Lazy load the map component to avoid bundling issues
const LazyMap = lazy(() => import('./LocationMap'));

interface LocationPreviewProps {
  address: string;
  className?: string;
}

interface BaseCoords {
  lat: number;
  lng: number;
}

interface RouteInfo {
  miles: number;
  minutes: number;
}

const formatMinutes = (mins: number): string => {
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
};

export const LocationPreview = ({ address, className }: LocationPreviewProps) => {
  const [coordinates, setCoordinates] = useState<BaseCoords | null>(null);
  const [baseCoords, setBaseCoords] = useState<BaseCoords | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the business's base service coordinates once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const coords = await fetchCurrentBusinessBaseCoordinates();
        if (cancelled || !coords) return;
        setBaseCoords(coords);
      } catch (err) {
        console.error('Failed to load base coordinates:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Geocode the appointment address.
  useEffect(() => {
    const lookup = async () => {
      if (!address) {
        setIsLoading(false);
        return;
      }

      try {
        const result = await geocodeAddress(address, { limit: 1 });
        if (result) {
          setCoordinates({ lat: result.lat, lng: result.lng });
        } else {
          setError('Location not found');
        }
      } catch (err) {
        console.error('Geocoding error:', err);
        setError('Could not load map');
      } finally {
        setIsLoading(false);
      }
    };

    lookup();
  }, [address]);

  // Compute driving distance/time from base → appointment.
  useEffect(() => {
    if (!coordinates || !baseCoords) return;
    let cancelled = false;
    (async () => {
      try {
        const route = await getDrivingRoute({
          origin: baseCoords,
          destination: coordinates,
          profile: 'driving-traffic',
        });
        if (cancelled) return;
        setRouteInfo({
          miles: route.distanceMeters / 1609.344,
          minutes: route.durationSeconds / 60,
        });
      } catch (err) {
        console.error('Driving route error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [coordinates, baseCoords]);

  const handleGetDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!address) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Service Location
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Address with directions link */}
        <button
          onClick={handleGetDirections}
          className="text-sm text-left text-primary hover:underline flex items-start gap-2 group w-full"
        >
          <span className="flex-1">{address}</span>
          <ExternalLink className="h-3.5 w-3.5 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </button>

        {/* Distance & Travel Time from base */}
        {routeInfo && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Route className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{routeInfo.miles.toFixed(1)} mi</span>
            </div>
            <span className="opacity-50">•</span>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{formatMinutes(routeInfo.minutes)}</span>
            </div>
            <span className="ml-auto opacity-70">from base</span>
          </div>
        )}

        {/* Map Preview */}
        <div className="h-40 rounded-lg overflow-hidden bg-muted relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : coordinates ? (
            <Suspense fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }>
              <LazyMap lat={coordinates.lat} lng={coordinates.lng} />
            </Suspense>
          ) : null}
        </div>

        {/* Directions Button */}
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full gap-2"
          onClick={handleGetDirections}
        >
          <Navigation className="h-4 w-4" />
          Get Directions
        </Button>
      </CardContent>
    </Card>
  );
};

export default LocationPreview;
